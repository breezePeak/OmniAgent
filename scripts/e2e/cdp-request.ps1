param(
  [Parameter(Mandatory = $true)]
  [int]$Port,

  [ValidateSet('browser', 'page')]
  [string]$Target = 'browser',

  [string]$TargetId,

  [string]$Method = 'Runtime.evaluate',

  [string]$ParamsJson = '{}',

  [string]$Expression,

  [int]$TimeoutSeconds = 20
)

if ($Target -eq 'page' -and -not $TargetId) {
  throw 'TargetId is required when Target is page.'
}

if ($Expression) {
  $Method = 'Runtime.evaluate'
  $params = @{
    expression = $Expression
    awaitPromise = $true
    returnByValue = $true
  }
} else {
  $params = $ParamsJson | ConvertFrom-Json -AsHashtable
}

$socket = [System.Net.WebSockets.ClientWebSocket]::new()
$timeout = [System.Threading.CancellationTokenSource]::new([TimeSpan]::FromSeconds($TimeoutSeconds))

try {
  if ($Target -eq 'browser') {
    $version = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/json/version"
    $uri = [Uri]$version.webSocketDebuggerUrl
  } else {
    $uri = [Uri]"ws://127.0.0.1:$Port/devtools/page/$TargetId"
  }

  $socket.ConnectAsync($uri, $timeout.Token).GetAwaiter().GetResult() | Out-Null

  $request = @{
    id = 1
    method = $Method
    params = $params
  } | ConvertTo-Json -Compress -Depth 20

  $requestBytes = [Text.Encoding]::UTF8.GetBytes($request)
  $socket.SendAsync(
    [ArraySegment[byte]]::new($requestBytes),
    [System.Net.WebSockets.WebSocketMessageType]::Text,
    $true,
    $timeout.Token
  ).GetAwaiter().GetResult() | Out-Null

  while ($true) {
    $stream = [IO.MemoryStream]::new()
    try {
      do {
        $buffer = New-Object byte[] 65536
        $chunk = $socket.ReceiveAsync(
          [ArraySegment[byte]]::new($buffer),
          $timeout.Token
        ).GetAwaiter().GetResult()

        if ($chunk.MessageType -eq [System.Net.WebSockets.WebSocketMessageType]::Close) {
          throw 'Chrome closed the DevTools connection before returning a result.'
        }

        $stream.Write($buffer, 0, $chunk.Count)
      } until ($chunk.EndOfMessage)

      $message = [Text.Encoding]::UTF8.GetString($stream.ToArray()) | ConvertFrom-Json
    } finally {
      $stream.Dispose()
    }

    if ($message.id -ne 1) {
      continue
    }

    if ($message.error) {
      throw "CDP error $($message.error.code): $($message.error.message)"
    }

    if ($message.result.exceptionDetails) {
      $detail = $message.result.exceptionDetails.exception.description
      if (-not $detail) {
        $detail = $message.result.exceptionDetails.text
      }
      throw "Evaluation failed: $detail"
    }

    $message.result | ConvertTo-Json -Depth 30
    break
  }
} finally {
  $socket.Dispose()
  $timeout.Dispose()
}
