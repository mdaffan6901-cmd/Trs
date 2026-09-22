#!/usr/bin/env bash
# github-push.sh — interactive Termux → GitHub push wizard
# Run with:  bash github-push.sh
# (or host it and run:  curl -fsSL <raw-url> | bash )

set -u

# ---------- colors ----------
RESET='\033[0m'
BOLD='\033[1m'
CYAN='\033[1;36m'
GREEN='\033[1;32m'
YELLOW='\033[1;33m'
RED='\033[1;31m'
BLUE='\033[1;34m'

line() { printf "${CYAN}────────────────────────────────────────────${RESET}\n"; }

banner() {
    clear
    line
    printf "${BOLD}${CYAN}   🚀  GitHub Push Wizard (Termux)  🚀${RESET}\n"
    line
    echo
}

step() {
    printf "${BLUE}${BOLD}▶ %s${RESET}\n" "$1"
}

success() {
    printf "${GREEN}${BOLD}✔ %s${RESET}\n" "$1"
}

warn() {
    printf "${YELLOW}⚠ %s${RESET}\n" "$1"
}

fail() {
    printf "${RED}${BOLD}✘ %s${RESET}\n" "$1"
}

# reads input character-by-character, echoing * for each typed/pasted char
# (works for pasted text too, since paste is delivered as a burst of chars)
read_masked() {
    local prompt="$1"
    local input=""
    local char
    printf "%b" "$prompt"
    while IFS= read -r -s -n1 char; do
        if [[ -z "$char" ]]; then
            break
        fi
        if [[ "$char" == $'\x7f' || "$char" == $'\x08' ]]; then
            if [ -n "$input" ]; then
                input="${input%?}"
                printf '\b \b'
            fi
        else
            input+="$char"
            printf '*'
        fi
    done
    echo
    MASKED_REPLY="$input"
}

# ---------- 0. banner + git check ----------
banner

step "Checking git installation..."
if ! command -v git >/dev/null 2>&1; then
    warn "git not found — installing now..."
    pkg install git -y
fi
success "git is ready."

# Trust all repos on this device — fixes Git's "dubious ownership" error,
# which happens for almost every folder on shared/external storage in
# Termux (the FUSE-mounted /storage/emulated/0 reports a different owner
# than Termux's own user). Safe for a personal single-user phone.
git config --global --add safe.directory '*' 2>/dev/null
echo

# ---------- 1. folder location ----------
BASE_DIR="$HOME/storage/shared"

step "Which project folder do you want to push?"
echo "   (path relative to your phone storage, e.g. Documents/MyProject"
echo "    — or paste a full absolute path starting with /)"
echo

while true; do
    read -rp "$(printf "${BOLD}Folder path:${RESET} ")" FOLDER_INPUT

    if [[ "$FOLDER_INPUT" == /* ]]; then
        TARGET_DIR="$FOLDER_INPUT"
    else
        TARGET_DIR="$BASE_DIR/$FOLDER_INPUT"
    fi

    if [ -d "$TARGET_DIR" ]; then
        cd "$TARGET_DIR" || { fail "Could not enter that folder."; continue; }
        success "Using folder: $TARGET_DIR"
        break
    else
        fail "That folder doesn't exist. Try again."
    fi
done
echo

# ---------- 2. new repo or existing repo? ----------
IS_NEW_REPO=true
EXISTING_REMOTE=""

if [ -d ".git" ]; then
    IS_NEW_REPO=false
    EXISTING_REMOTE=$(git remote get-url origin 2>/dev/null || echo "")
fi

if [ "$IS_NEW_REPO" = false ] && [ -n "$EXISTING_REMOTE" ]; then
    step "This folder is already linked to a GitHub repo:"
    echo "   $EXISTING_REMOTE"
    read -rp "$(printf "${BOLD}Use this repo? (Y/n):${RESET} ")" KEEP_REMOTE
    KEEP_REMOTE=${KEEP_REMOTE:-Y}
    if [[ "$KEEP_REMOTE" =~ ^[Nn]$ ]]; then
        REPO_URL=""
    else
        REPO_URL="$EXISTING_REMOTE"
    fi
else
    REPO_URL=""
fi

# ---------- 3. repo url (if needed) ----------
if [ -z "$REPO_URL" ]; then
    step "Enter the GitHub repository link (HTTPS, from the 'Code' button):"
    while true; do
        read -rp "$(printf "${BOLD}Repo URL:${RESET} ")" REPO_URL
        if [[ "$REPO_URL" == https://github.com/* ]]; then
            break
        else
            fail "That doesn't look like a valid https://github.com/... link. Try again."
        fi
    done
fi
echo

# ---------- 4. git identity (auto, silent — never asked) ----------
# Git needs *some* name/email to label commits with, but this has nothing to
# do with login or the token — so we derive it quietly from the repo URL's
# owner instead of asking. Only fills in if not already configured.
if [ -z "$(git config --global user.name 2>/dev/null)" ]; then
    REPO_OWNER=$(echo "$REPO_URL" | sed -E 's#https://github.com/([^/]+)/.*#\1#')
    git config --global user.name "$REPO_OWNER"
    git config --global user.email "${REPO_OWNER}@users.noreply.github.com"
fi

# ---------- 5. commit message + description (both optional) ----------
step "Commit message (press Enter to skip and use a default):"
read -rp "$(printf "${BOLD}Message:${RESET} ")" COMMIT_MSG
if [ -z "$COMMIT_MSG" ]; then
    COMMIT_MSG="Update $(date '+%Y-%m-%d %H:%M')"
fi

step "Commit description (optional, press Enter to skip):"
read -rp "$(printf "${BOLD}Description:${RESET} ")" COMMIT_DESC
echo

# ---------- 6. access token (masked input, never stored) ----------
step "GitHub Personal Access Token (shown as *, nothing is saved to disk):"
read_masked "$(printf "${BOLD}Token:${RESET} ")"
GH_TOKEN="$MASKED_REPLY"
unset MASKED_REPLY
echo

if [ -z "$GH_TOKEN" ]; then
    fail "No token entered — cannot push without one. Aborting."
    exit 1
fi

# ---------- 7. do the actual work ----------
line
step "Working..."

if [ "$IS_NEW_REPO" = true ]; then
    git init -q
    git branch -M main 2>/dev/null
fi

git add -A

if [ -n "$COMMIT_DESC" ]; then
    git commit -m "$COMMIT_MSG" -m "$COMMIT_DESC" >"$HOME/.gh_commit_log" 2>&1
else
    git commit -m "$COMMIT_MSG" >"$HOME/.gh_commit_log" 2>&1
fi
COMMIT_STATUS=$?

if [ $COMMIT_STATUS -ne 0 ]; then
    if grep -qi "nothing to commit" "$HOME/.gh_commit_log"; then
        warn "Nothing changed since the last commit — will still try to push."
    else
        fail "Commit failed:"
        cat "$HOME/.gh_commit_log"
        rm -f "$HOME/.gh_commit_log"
        unset GH_TOKEN
        exit 1
    fi
fi
rm -f "$HOME/.gh_commit_log"

# make sure 'origin' points to the plain (token-free) URL for future manual use
git remote remove origin >/dev/null 2>&1
git remote add origin "$REPO_URL"

# build a one-time push URL with the token embedded — never stored in git config
PUSH_URL="${REPO_URL/https:\/\//https:\/\/$GH_TOKEN@}"

CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "main")

git push -u "$PUSH_URL" "$CURRENT_BRANCH" >"$HOME/.gh_push_log" 2>&1
PUSH_STATUS=$?

# wipe the token from memory immediately after use
unset GH_TOKEN
unset PUSH_URL

echo
line
if [ $PUSH_STATUS -eq 0 ]; then
    success "Push complete!"
    echo
    printf "${BOLD}Repo:${RESET}    %s\n" "$REPO_URL"
    printf "${BOLD}Branch:${RESET}  %s\n" "$CURRENT_BRANCH"
    printf "${BOLD}Message:${RESET} %s\n" "$COMMIT_MSG"
    [ -n "$COMMIT_DESC" ] && printf "${BOLD}Details:${RESET} %s\n" "$COMMIT_DESC"
    echo
    printf "${GREEN}${BOLD}   ✅  Your code is now on GitHub  ✅${RESET}\n"
else
    fail "Push failed. Details:"
    cat "$HOME/.gh_push_log"
    echo
    warn "Common causes: wrong token, token missing 'repo' scope, or no internet."
fi
rm -f "$HOME/.gh_push_log"
line
