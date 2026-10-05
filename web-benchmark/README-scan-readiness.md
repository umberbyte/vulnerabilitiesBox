# ZAP再計測の状況（2026-10-05）

この文書は保存済みのローカルDocker資料を照合した作業用スナップショットです。最新値は`artifacts/coverage-inventory.json`、`artifacts/evidence-linkage.json`、`artifacts/artifact-audit.json`を`reports.cmd`または`reports.sh`で再生成して確認してください。履歴の`artifacts/core-dast-*-20261004.*`は作業PCのローカル成果物で、公開Gitには含めません。新しいチェックアウトに履歴がなければ、履歴に基づく件数を現在の計測結果として使わないでください。ここにある件数を検出率や製品比較の分母にしません。

代表630セルの旧原本欠損と別履歴の取り込みについては[証拠欠損の記録](README-evidence-incident.md)を参照してください。旧B0226-V失敗は現在の機械集計に現れません。

## 現在の証拠

現在の機械棚卸しでは500変種中499変種に個別V/F/N合格記録があります。B0335はVでCORS許可ヘッダーの差があるものの、ローカルChromiumが非セキュアoriginからローカルアドレスへの要求を先に遮断するため、ブラウザーでの秘密情報読取は未確認です。B0226の旧失敗は残存ログと欠損前の棚卸しで確認でき、現在の機械集計には含まれません。詳細は[成立確認の記録](README-coverage.md)を参照してください。

保存済みの監査済みZAP台帳では、258変種にV/F/N完走系列があります。そのうち106変種は個別成立確認と診断の実行ソースを照合できました（従来の31変種、B0226、B0001、B0005、B0021、[B0022・B0029・B0031](README-core-browser-three-zap.md)、[B0025・B0026・B0027](README-core-interaction-three-zap.md)、[B0034・B0043・B0047](README-core-browser-next-zap.md)、[B0050・B0061・B0065](README-core-data-next-zap.md)、[B0054・B0056・B0059・B0062](README-browser-four-source-zap.md)、[B0372～B0376](README-cache-five-source-zap.md)、[B0385・B0386・B0388・B0389](README-cache-next-four-source-zap.md)、[B0343・B0344・B0378・B0379・B0381](README-cache-ws-five-source-zap.md)、[B0339・B0342・B0345・B0349・B0454](README-stream-five-source-zap.md)、[B0348・B0350](README-representative-browser-events-source-zap.md)、[B0165・B0166・B0173・B0174・B0175](README-local-fetch-five-source-zap.md)、[B0120・B0161・B0177・B0180](README-local-fetch-next-four-source-zap.md)、[B0049・B0127・B0150・B0459・B0462](README-mixed-five-source-zap.md)、[B0094・B0209・B0212・B0242・B0250](README-auth-five-source-zap.md)、[B0463・B0466・B0480](README-internal-three-source-zap.md)、[B0471](README-nosniff-source-zap.md)、[B0003・B0006・B0041・B0057・B0060](README-representative-five-source-zap.md)、[B0121・B0123・B0124・B0126・B0135](README-path-five-source-zap.md)）。残る152変種は個別成立記録があってもソース対応が未確認です。依存サービスの実際のイメージID、DB・Redis等の状態、ホスト資源まで一致を証明できた系列はありません。完走は到達・検出・脆弱性成立を示しません。現在の系列単位の理由は`artifacts/evidence-linkage.md`にあります。

31変種の環境資料を台帳の系列別に棚卸しすると、再計測23変種に対応する5台帳には、アプリ・DB・Redis・Mongo・LDAP・executorのコンテナID・イメージID・起動時刻を記した前後の記録があります。5組とも6サービスの記録は一致し、終了側にはZAPコンテナがありません。[前後記録の照合範囲](README-budget-retry.md)を参照してください。失敗再計測7変種とB0011には、この5組に相当する前後の依存環境記録を確認できません。23変種についても、記録された時点間のコンテナ同一性だけでは走査中の状態や個別成立確認時との環境一致を証明できません。したがって、31変種とも環境対応付け済みとは数えません。

## 2026-10-04時点で未完了だった62変種の扱い

2026-10-04の[コアDAST分析](artifacts/core-dast-analysis-20261004.md)で、追加計測した271変種のうち209変種はV/F/Nが完走し、62変種は未完了でした。この62変種のうち61変種には現在、個別V/F/N成立記録があります。例外はB0335です。未完了の理由は次のとおりです。

| 状態 | 変種数 | 次の条件整備 |
|---|---:|---|
| 対象面が未対応 | 32 | 保存済みrunでは全件が複数originを要求した。originの役割と実操作の証拠を[計測条件の棚卸し](README-multi-origin-readiness.md)に整理した。B0335は先に成立条件を見直す。 |
| 予算停止 | 23 | 別系列で上限を拡張し、23変種のV/F/N完走を確認した。旧停止runは保持し、新しい系列と区別する。詳細は[再計測結果](README-budget-retry.md)。 |
| 実行失敗 | 7 | 原因別の新しい計画でV/F/N計21セルが完走した。旧失敗runは保持した。詳細は[実行失敗7変種の再計測](README-failed-seven-retry.md)。 |

変種ごとの旧状態と元台帳は[未完了一覧](artifacts/core-dast-incomplete-current-20261004.md)にあります。これは2026-10-04の履歴です。今回までの再計測後、この62変種のうち30変種に完走系列ができ、32変種はまだ完走系列がありません。残る32変種は対象面が未対応と分類されたものです。

## 次の計測で固定するもの

新しい実行はローカルDockerの対象だけに限定し、旧台帳を上書きせず新しいplan・ledger・runを保存します。同一変種のV/F/Nには同じseed、ZAPイメージdigest、add-on一覧、設定hash、認証主体、要求数・時間予算、対象originを使い、各armで通常入口と保護経路の到達、要求数、終了時の通信drainを記録します。スキャン時の対象実行ソースと検証側ソースを照合し、同じソース版で取った個別成立記録に結びます。現在のソース照合は`src/`とpackage manifestsの範囲なので、依存サービスのイメージ・状態とホスト資源は別に記録し、未取得なら「環境一致未確認」のままにします。

Vのみ候補27変種とF/N側の要注意6変種は、上記の対応が取れた系列から、plugin IDだけでなく実HTTP要求・応答、issueの対象URL、通常操作と当該根本原因の成立証拠を人間が照合します。要注意6変種のうちB0472の該当alertはMediumで、6件すべてがHighという意味ではありません。関連しない共通ヘッダーや別経路のalertは、対象欠陥の検出・誤検出に数えません。Burpの実測はライセンス調達後に同じ条件で行います。

予算停止23変種の再計測条件とオフライン計画の再作成方法は[再計測結果](README-budget-retry.md)、実行失敗7変種については[原因別の再計測](README-failed-seven-retry.md)を参照してください。

2026-10-05の[B0105 XPath再計測](README-xpath-b0105-source-zap.md)では、当初のLDAP混合成立確認で`Uncovered root`となった失敗原票を保管し、集計から除外した。B0105のみ正式確認を再実行してソース対応を1変種追加した。
