; ============================================================================
; code.iss — Pascal script: detects PowerPoint, warns the user before install
; if it is running, and shows a "restart PowerPoint" finish-page hint.
;
; Office only re-reads the WEF registry on launch, so installing while
; PowerPoint is open silently does nothing visible. Hence the warning.
; ============================================================================

[Code]

function IsPowerPointRunning(): Boolean;
var
  ResultCode: Integer;
  TempFile: string;
  Lines: TArrayOfString;
  i: Integer;
begin
  Result := False;
  TempFile := ExpandConstant('{tmp}\pp_check.txt');

  { tasklist exits 0 even when the process is missing, so we have to inspect output. }
  Exec(ExpandConstant('{cmd}'),
       '/C tasklist /FI "IMAGENAME eq POWERPNT.EXE" /NH > "' + TempFile + '"',
       '', SW_HIDE, ewWaitUntilTerminated, ResultCode);

  if FileExists(TempFile) and LoadStringsFromFile(TempFile, Lines) then
  begin
    for i := 0 to GetArrayLength(Lines) - 1 do
    begin
      if Pos('POWERPNT.EXE', Uppercase(Lines[i])) > 0 then
      begin
        Result := True;
        Break;
      end;
    end;
    DeleteFile(TempFile);
  end;
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
begin
  Result := '';
  if IsPowerPointRunning() then
  begin
    if MsgBox(
      'PowerPoint is currently running.' + #13#10 + #13#10 +
      'Prezo will not appear in the ribbon until PowerPoint is restarted.' + #13#10 + #13#10 +
      'Continue installation anyway? (You can restart PowerPoint after install completes.)',
      mbConfirmation, MB_YESNO) = IDNO then
    begin
      Result := 'Installation cancelled by user.';
    end;
  end;
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssPostInstall then
  begin
    { Friendly post-install hint. The Inno "Finish" page also displays our message,
      but a MsgBox guarantees it is seen even if the user clicks Finish quickly. }
    if IsPowerPointRunning() then
    begin
      MsgBox(
        'Installation complete.' + #13#10 + #13#10 +
        'Please close and reopen PowerPoint. Prezo will appear under the Home tab on next launch.',
        mbInformation, MB_OK);
    end;
  end;
end;
