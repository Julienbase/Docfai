# PowerShell script to download and setup portable Python for Windows
# This creates a self-contained Python environment that can be bundled with the app

Write-Host "Setting up portable Python for Docfai..." -ForegroundColor Green

$pythonVersion = "3.11.9"
$pythonUrl = "https://www.python.org/ftp/python/$pythonVersion/python-$pythonVersion-embed-amd64.zip"
$pythonDir = "$PSScriptRoot\..\python\runtime"
$pythonZip = "$PSScriptRoot\..\python\python-embed.zip"

# Create directory
Write-Host "`nCreating Python runtime directory..." -ForegroundColor Cyan
New-Item -ItemType Directory -Force -Path $pythonDir | Out-Null

# Download Python embeddable package
Write-Host "Downloading Python $pythonVersion embeddable package..." -ForegroundColor Cyan
Write-Host "URL: $pythonUrl" -ForegroundColor Gray
Invoke-WebRequest -Uri $pythonUrl -OutFile $pythonZip

# Extract Python
Write-Host "`nExtracting Python..." -ForegroundColor Cyan
Expand-Archive -Path $pythonZip -DestinationPath $pythonDir -Force

# Download get-pip.py
Write-Host "`nDownloading get-pip.py..." -ForegroundColor Cyan
$getPipUrl = "https://bootstrap.pypa.io/get-pip.py"
Invoke-WebRequest -Uri $getPipUrl -OutFile "$pythonDir\get-pip.py"

# Uncomment python311._pth to allow pip installation
Write-Host "`nConfiguring Python paths..." -ForegroundColor Cyan
$pthFile = Get-ChildItem -Path $pythonDir -Filter "python*._pth" | Select-Object -First 1
if ($pthFile) {
    $content = Get-Content $pthFile.FullName
    $content = $content -replace '^#import site', 'import site'
    $content | Set-Content $pthFile.FullName
    Write-Host "Updated: $($pthFile.Name)" -ForegroundColor Gray
}

# Install pip
Write-Host "`nInstalling pip..." -ForegroundColor Cyan
& "$pythonDir\python.exe" "$pythonDir\get-pip.py"

# Install argostranslate and dependencies
Write-Host "`nInstalling Argos Translate..." -ForegroundColor Cyan
& "$pythonDir\python.exe" -m pip install argostranslate==1.9.1

# Clean up
Write-Host "`nCleaning up..." -ForegroundColor Cyan
Remove-Item $pythonZip -Force

# Verify installation
Write-Host "`nVerifying installation..." -ForegroundColor Cyan
& "$pythonDir\python.exe" -c "import argostranslate; print(f'Argos Translate {argostranslate.__version__} installed successfully!')"

Write-Host "`n==================================" -ForegroundColor Green
Write-Host "Portable Python Setup Complete!" -ForegroundColor Green
Write-Host "==================================" -ForegroundColor Green
Write-Host "`nLocation: $pythonDir" -ForegroundColor White
Write-Host "Python: $pythonVersion (embedded)" -ForegroundColor White

# Get size
$size = (Get-ChildItem $pythonDir -Recurse | Measure-Object -Property Length -Sum).Sum / 1MB
Write-Host "Size: $([math]::Round($size, 1)) MB" -ForegroundColor White

Write-Host "`nNext steps:" -ForegroundColor Yellow
Write-Host "1. Python runtime is ready in python/runtime/" -ForegroundColor Gray
Write-Host "2. Language models are in python/models/" -ForegroundColor Gray
Write-Host "3. App will use bundled Python - no user installation needed!" -ForegroundColor Gray
