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

echo Installing Sharp Linux binaries...
call npm install --force --no-save @img/sharp-linux-x64
if errorlevel 1 goto error

echo Installing Sharp libvips library for Linux...
call npm install --force --no-save @img/sharp-libvips-linux-x64
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
