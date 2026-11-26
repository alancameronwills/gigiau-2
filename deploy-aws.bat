@echo off
REM Deploy to AWS Lambda with correct Sharp binaries for Linux
REM Usage: deploy-aws.bat [stage]
REM   stage: dev or prod (default: dev)

setlocal
set STAGE=%1
if "%STAGE%"=="" set STAGE=dev

echo Installing dependencies for AWS Lambda (Linux)...
call npm install
if errorlevel 1 goto error

echo Installing Sharp Linux binaries (one command - separate --no-save installs prune each other)...
call npm install --force --no-save @img/sharp-linux-x64@0.34.5 @img/sharp-libvips-linux-x64@1.2.4
if errorlevel 1 goto error

echo Deploying to AWS stage: %STAGE%...
call npm run deploy -- --stage %STAGE%
if errorlevel 1 goto error

echo.
echo Deployment successful!
goto end

:error
echo.
echo Deployment failed!
exit /b 1

:end
