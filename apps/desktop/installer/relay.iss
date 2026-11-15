; Relay: Inno Setup installer script (same approach as Umbra's umbra.iss).
;
; Packages apps/desktop/release/win-unpacked (electron-builder --dir, with
; audiocap.exe and winlist.exe in resources\bin) into a per-user installer.
;
; Build, from this directory, on Windows with Inno Setup 6:
;   iscc relay.iss /DMyAppVersion=0.1.0
; Expects "npm run package" (in apps/desktop) to have run first.

#define MyAppName "Relay"
#define MyAppPublisher "David Ambrozio"
#define MyAppURL "https://github.com/davidambz/relay"
#define MyAppExeName "Relay.exe"

#ifndef MyAppVersion
  #define MyAppVersion "0.0.0"
#endif
#ifndef MyAppSourceDir
  #define MyAppSourceDir "..\release\win-unpacked"
#endif

[Setup]
; Generated once for Relay. Never reuse Umbra's, never regenerate: it's
; what makes an update install over the previous version.
AppId={{BE5E8E82-C888-425A-8AE7-360B5286AA00}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
; Self-update (src/main/updater.ts) runs this installer with
; /VERYSILENT ... /RELAUNCH and quits. CloseApplications=force is the
; safety net if Relay is still running; relaunching is done by the [Run]
; entry below rather than RestartApplications, because Electron doesn't
; register with Restart Manager (Umbra calls RegisterApplicationRestart).
CloseApplications=force
RestartApplications=no
; A per-user app with no system-wide effect: no admin rights.
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
LicenseFile=..\..\..\LICENSE
OutputDir=output
OutputBaseFilename=RelaySetup-{#MyAppVersion}
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
WizardImageFile=wizard-image.bmp
WizardSmallImageFile=wizard-small.bmp
SetupIconFile=..\build\icon.ico
UninstallDisplayIcon={app}\{#MyAppExeName}
UninstallDisplayName={#MyAppName}

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"
Name: "brazilianportuguese"; MessagesFile: "compiler:Languages\BrazilianPortuguese.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
Source: "{#MyAppSourceDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[InstallDelete]
; A previous version's files that the new one no longer ships (renamed
; chunks, locales) shouldn't linger in the install folder.
Type: filesandordirs; Name: "{app}\resources"

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{group}\{cm:UninstallProgram,{#MyAppName}}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#MyAppName}}"; Flags: nowait postinstall skipifsilent
; Self-update: reopen Relay once the silent install finishes.
Filename: "{app}\{#MyAppExeName}"; Flags: nowait; Check: ShouldRelaunch

[Code]
function ShouldRelaunch(): Boolean;
begin
  Result := WizardSilent() and (Pos('/RELAUNCH', UpperCase(GetCmdTail())) > 0);
end;
