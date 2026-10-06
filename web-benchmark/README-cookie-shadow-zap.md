# B0236 同名Cookie shadowのZAP V/F/N走査（2026-10-06）

既存B0236をローカルDockerで同一条件のV/F/Nとして走査した。計画は`artifacts/panel-cookie-shadow-c8-20261006-retry1.json`、完走台帳は`artifacts/panel-cookie-shadow-c8-20261006-retry1-ledger.json`。scan originは`https://app.benchmark.test:8443`、兄弟ホスト`https://evil.benchmark.test:8443`のログインとCookie発行はブラウザー観測専用とし、spider・active scanには含めなかった。Aliceの正常ログイン後、兄弟ホストでBobの正常ログインと公開されたCookie発行操作を行い、本人ホストのアカウントを再表示した。seed、認証、ZAP版・add-on、予算240秒・8000要求、指定8スレッドを3セルで揃えた。

| セル | run ID | 要求数 | 実ピーク | 本人ホストの認証Cookie | 兄弟ホスト操作後の表示 |
| --- | --- | ---: | ---: | --- | --- |
| V | `zap-2026-10-06T08-12-20-879Z-890b78` | 254 | 4 | `memberSession` | Bob |
| F | `zap-2026-10-06T08-12-28-700Z-b065f9` | 254 | 4 | `__Host-memberSession` | Alice |
| N | `zap-2026-10-06T08-12-35-510Z-7ac28e` | 254 | 4 | `__Host-memberSession` | Alice |

全セルで兄弟ホストが発行した親Domainの同名Cookieと本人ホストのCookieが最終アカウント要求へ送信された。ZAP履歴のCookieヘッダー、Cookie発行応答、最終アカウント応答とChromium表示を照合した。各runに生HTTP、ZAP HTML、兄弟ホストのログイン・発行操作の完了した履歴、終了時の保留通信0、controllerと対象アプリの実行ソース一致が残る。これはブラウザー観測であり、ZAP alert数52・53・54を欠陥検出数や真陽性数として扱わない。個別V/F/N成立確認時との実行ソースハッシュ一致は未確認である。

初回の`artifacts/panel-cookie-shadow-c8-20261006-ledger.json`は追加変種の公開定義に保護アカウント契約がなく、匿名条件で作成されたため3セルとも`unsupported`だった。原本を保存し、公開定義へ保護アカウントの経路を追加した新計画で3/3セルを完走した。
