@echo off 
cd /d C:\Users\macie\ha-tools-repo 
git stash pop 2>nul 
git filter-branch --force --index-filter \"git rm --cached --ignore-unmatch CLAUDE.md\" --prune-empty -- --all 
echo DONE
