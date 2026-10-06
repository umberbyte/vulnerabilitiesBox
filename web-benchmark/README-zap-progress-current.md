# ZAP V/F/N走査の進捗（2026-10-06）

ローカルDockerの既存500変種について、保存済みの計画・台帳・runを`reports.cmd`で再集計した。V/F/Nの3セルが同一系列で完了した変種は470/500（94%）、未完走は30/500（6%）。前回集計408/500から56変種、168セルを明示的な8スレッド、active、各セル240秒・8,000要求の別系列で完走した。さらにB0002、B0222、B0231、B0233、B0367、B0461の各3セルを別系列で完走した。各セルの通信収束、実行ソース、ZAP HTMLと生HTTPをローカルに保存した。

| 系列の台帳（ローカル`artifacts/`） | 新規完走変種 | 完了セル |
| --- | ---: | ---: |
| `panel-bounded-421-440-c8-20261006-ledger.json` | 20 | 60/60 |
| `panel-native-491-496-c8-20261006-ledger.json` | 6 | 18/18 |
| `panel-lifecycle-411-420-c8-20261006-ledger.json` | 10 | 30/30 |
| `panel-protocol-single-c8-20261006-ledger.json` | 11 | 33/33 |
| `panel-protocol-extra-session-c8-20261006-ledger.json` | 4 | 12/12 |
| `panel-r0368-c8-20261006-ledger.json` | 1 | 3/3 |
| `panel-parse-extra-c8-20261006-ledger.json` | 4 | 12/12 |
| `panel-b0002-c4-drain90-20261006-ledger.json` | 1 | 3/3 |
| `panel-b0222-elevation-guard-c6-rebuilt-20261006-ledger.json` | 1 | 3/3 |
| `panel-b0231-c8-20261006-ledger.json` | 1 | 3/3 |
| `panel-b0461-dual-c8-20261006-ledger.json` | 1 | 3/3 |
| `panel-b0367-forward-c8-retry-20261006-ledger.json` | 1 | 3/3 |
| `panel-b0233-browser-c8-20261006-retry1-ledger.json` | 1 | 3/3 |

B0233の実ブラウザーによるHTTP Cookie送出と保存済みZAP要求の照合、初回台帳失敗の経緯は[専用の走査記録](README-b0233-browser-zap.md)を参照する。

未完走30変種はすべてコアDAST。[個別の一覧](artifacts/evidence-linkage.md)はローカルで再生成される。多くは複数originまたはWebSocket frameの観測条件が現行ZAP adapterにないため、宣言された対象面の確認前に停止する。

B0222の旧8・6スレッド系列では、OpenAPIの正常な昇格POST例の再生後に認証主体が変わり、`auth_identity_mismatch`で停止した。公開manifestにある認証付きの昇格例をOpenAPI自動取込から除外し、アプリとcontrollerを同じソースで再構築した6スレッド系列では、V/F/Nすべて227要求で完了した。昇格POST自体は今回のZAP系列で実行・採点していない。失敗した旧台帳と、ソース不一致で走査前に止まった最初の再試行台帳も保持する。B0231の8スレッド系列はV/F/N各448要求で完了した。両系列ともZAP終了時の通信残は0だが、旧個別成立確認との実行ソースハッシュは一致していないため、成立・検出・誤検出を推定しない。

B0461では公開manifestが宣言する`http://benchmark.test:8080`と`https://app:8443`の両方を計測範囲とし、各originのGETとHTTP上の正常なPOSTをZAPから送った。8スレッドのV/F/Nでそれぞれ1,767・1,820・1,820要求、GETのHTTP応答は200・308・308、HTTP POSTは200・426・426だった。両originのspider・active scanは完了し、終了時の保留通信は0、ZAP HTMLと各originのHTTP履歴は全件保存した。ブラウザーのフォーム遷移はこの系列で再生していない。旧個別成立確認との実行ソースハッシュも異なるため、今回の応答差だけで検出成否や脆弱性成立を判定しない。

B0367では固定した`http://app:8080`と`https://app:8443`を対象とし、HTTPSで本人確認したfixtureセッションのCookieを、HTTP上の診断対象POSTへ明示的に付けた。保存HTTP要求に`X-Forwarded-Proto: https`とCookieが残り、V/F/Nの応答は200・426・426だった。初回系列は公開manifestの最初のPOSTであるログインを誤選択し、Vで`auth_identity_mismatch`となって停止した。失敗原本を保持し、対象入口と同じpathのPOSTだけを選ぶよう修正した新系列では3/3セルが完了した。8スレッド指定の実ピークは各5、要求数は460・459・459で、認証の終了後確認、両originの履歴全件保存、spider・active scan完了、保留通信0、実行ソース一致を確認した。汎用spider・active scanはこのCookieと申告値の組み合わせを自動再現しないため、明示的な診断要求とZAPの検出判定は分ける。

B0002の8・6・4スレッドの旧系列は、Vセルの走査が終わっても30秒のdrain上限時に`pendingHandlers=1`で停止した。旧原票を保持し、runnerの終了時drain上限を90秒にして対象アプリを同じソースから再構築した。独立した4スレッド系列ではV/F/Nが完了し、Vのdrainは32.144秒、F/Nは各約1秒、終了時の保留処理は各0だった。これは30秒上限を超えた処理の収束を記録した結果であり、B0002の欠陥をZAPが検出したという判定ではない。

500変種すべてに個別V/F/N成立確認記録があるが、走査と成立確認の実行ソースを照合できた完走変種は262。残る完走208変種は旧系列にソース記録がない39と、現行ソースとのハッシュ不一致169である。依存サービス・状態・ホスト環境まで一致を証明した件数は0。走査完了は欠陥への到達、ZAPの検出、真陽性・誤陽性の判定を意味しない。集計原本、HTMLレポート、runは作業PCの`artifacts/`にあり、公開Gitには含めない。
