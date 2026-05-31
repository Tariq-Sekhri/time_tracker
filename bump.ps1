param(
    [Parameter(Mandatory = $true, Position = 0)]
    [string]$Type
)

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
node "$scriptDir/scripts/bump.mjs" $Type
exit $LASTEXITCODE
