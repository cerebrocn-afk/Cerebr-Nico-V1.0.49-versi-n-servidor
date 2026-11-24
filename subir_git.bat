@echo off
cd /d "C:\Users\BirdBox\Downloads\cerebronico-ide-v1.0.55-servidor\cerebronico-ide-v1.0.55-servidor"
if not exist .git (
    git init
)
git config user.name "CerebroNico"
git config user.email "cerebronico@local.host"
git remote remove origin 2>nul
git remote add origin https://github.com/cerebrocn-afk/Cerebr-Nico-V1.0.49-versi-n-servidor.git

if not exist .gitignore (
    echo node_modules/ > .gitignore
    echo .env >> .gitignore
    echo .env.* >> .gitignore
    echo *.log >> .gitignore
    echo .venv/ >> .gitignore
    echo .cache/ >> .gitignore
)

git add .
git commit -m "CerebroNico V1.0.55 Server Edition release"
git branch -M main
git push -u origin main --force
