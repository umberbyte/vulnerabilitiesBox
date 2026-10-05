# 匿名コアDAST代表5変種の成立確認とZAP再計測

2026-10-05にB0003（SQL列識別子）、B0006（WHERE演算子）、B0041（innerHTML）、B0057（iframe.srcdoc）、B0060（テンプレートDOM評価）をローカルDockerで確認した。[正式な個別V/F/N成立確認](artifacts/acceptance-saved-representative-five-source-20261005.json)は15セル・206チェックすべて合格した。対象アプリの実行ソース証拠を成立確認の前後で取得し、安定していることを確認した。外部・顧客システムは対象にしていない。

[計画](artifacts/panel-representative-five-source-20261005.json)と[台帳](artifacts/panel-representative-five-source-20261005-ledger.json)にZAPの15セルを保存した。全セルは`completed`、実行エラー0、通信履歴の保存とdrainは完了した。seedは`acceptance-v1`、profileは`active`、匿名認証、指定上限は90秒・700リクエスト、並列2リクエスト。成立確認と各ZAPセルの対象アプリ実行ソースSHA-256は`3857151b1f920ba5f58378688911d04d4b8fb11109b18854b555d388a6bea6d2`で一致した。依存サービスやホスト環境全体の一致までは証明していない。

| 変種 | V/F/Nの実行リクエスト数 | V/F/Nの保存済みZAP通信数 | V/F/Nの全アラート数 | ZAP HTML |
| --- | --- | --- | --- | --- |
| B0003 | 667/667/667 | 606/607/607 | 32/32/32 | [V](artifacts/zap-2026-10-05T07-53-38-559Z-3bbc32/zap-report.html)・[F](artifacts/zap-2026-10-05T07-54-25-423Z-be92ba/zap-report.html)・[N](artifacts/zap-2026-10-05T07-55-05-792Z-0755aa/zap-report.html) |
| B0006 | 672/672/672 | 612/612/612 | 32/32/32 | [V](artifacts/zap-2026-10-05T07-55-48-574Z-ec6003/zap-report.html)・[F](artifacts/zap-2026-10-05T07-56-31-297Z-d1966d/zap-report.html)・[N](artifacts/zap-2026-10-05T07-57-12-028Z-2466bc/zap-report.html) |
| B0041 | 235/235/235 | 174/174/174 | 31/31/31 | [V](artifacts/zap-2026-10-05T07-57-52-757Z-57f35d/zap-report.html)・[F](artifacts/zap-2026-10-05T07-58-11-319Z-62e351/zap-report.html)・[N](artifacts/zap-2026-10-05T07-58-31-844Z-63b381/zap-report.html) |
| B0057 | 464/463/463 | 403/402/402 | 38/36/36 | [V](artifacts/zap-2026-10-05T07-58-50-357Z-f54022/zap-report.html)・[F](artifacts/zap-2026-10-05T07-59-21-040Z-5c2380/zap-report.html)・[N](artifacts/zap-2026-10-05T07-59-49-679Z-2527e7/zap-report.html) |
| B0060 | 462/462/462 | 401/401/401 | 36/36/36 | [V](artifacts/zap-2026-10-05T08-00-20-284Z-218d93/zap-report.html)・[F](artifacts/zap-2026-10-05T08-00-48-898Z-69f441/zap-report.html)・[N](artifacts/zap-2026-10-05T08-01-17-485Z-e2f309/zap-report.html) |

B0057のVにだけplugin 10031「User Controllable HTML Element Attribute (Potential XSS)」のInformationalアラートが2件あり、`/b2-srcdoc`の`srcdoc`パラメータを指す。警告のURLは無害な通常入力`<p>Welcome</p>`に対応し、保存されたアラートにはスクリプト実行の証拠がない。対象に関係する入力面の検出候補として扱い、TPを確定しない。B0003、B0006、B0041、B0060では、V/F/Nのアラート件数とplugin別件数は同じだった。B0006やB0060にはURL符号化の違いによるアラートURL差があり、これを新たな検出として数えない。5変種ともHighアラートは0件だった。成立確認の合格、ZAPの入口到達、欠陥の検出は別の証拠として扱う。

オフラインの[証拠対応表](artifacts/evidence-linkage.md)では実行ソース対応済みが95から100変種、個別成立記録はあるがソース対応未確認が163から158変種となった。V/F/N完走系列がある変種は258のまま、依存環境の完全対応済みは0のままである。
