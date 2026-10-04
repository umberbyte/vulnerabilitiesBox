# 旧実行失敗7変種の再計測（2026-10-05）

2026-10-04のコアDAST台帳でVが失敗しF/Nが未実行だった7変種を、ローカルDocker上の現在の実装で再計測した。旧台帳と失敗runは残し、新しい計画・台帳・runを別名で保存した。以下の`artifacts/`内のファイルは作業PCのローカル成果物で、公開Gitには含めない。別のPCでは件数だけを実測値として転記しない。

| 変種 | 旧停止理由 | 今回の条件と結果 |
|---|---|---|
| B0460、B0467、B0468、B0469 | Vのresetで`private_api_failed` | 現行アプリではB0460の単独resetが成功。4変種、匿名、active、1500要求・180秒のV/F/N計12セルが完走。旧停止の根本原因は特定できていない。 |
| B0240、B0245 | 認証後の保護経路で404、`auth_protected_unreachable` | 旧スキャン後のcommit `c6ba4d0`で共通ルートのgateが`next('route')`へ修正された。B0240の保護ページは直接確認で認証後200。2変種、session/alice、active、1500要求・180秒の計6セルが完走。 |
| B0142 | 700要求の予算に達して認証後確認が完了せず、`auth_budget_exhausted` | session/alice、active、3000要求・300秒のV/F/N計3セルが完走。 |

新しい台帳は順に`artifacts/failed-seven-anonymous-20261005-ledger.json`、`artifacts/failed-seven-protocol-20261005-ledger.json`、`artifacts/failed-seven-image-20261005-ledger.json`。各台帳はplanのhash、cell、認証条件、予算、runへの参照を保持する。各runの`run.json`と`zap-report.html`、全体の`artifacts/index.html`で個別結果と人が読めるZAPレポートを確認できる。

同じソースで6変種の個別V/F/N成立確認18セルを`artifacts/extended-regression-saved-failed-seven-six-20261005.json`、B0142の3セルを`artifacts/acceptance-saved-r0142-rescan-20261005.json`に保存し、いずれも合格した。再生成した`artifacts/evidence-linkage.json`では、この7変種のスキャン時ソースと成立確認ソースが一致する。依存サービスの内容・実行環境まで完全一致した証拠はまだない。

オフライン集計で、500変種中257変種に監査済みV/F/N完走系列があり、うち31変種は個別成立確認と実行ソースが対応する。旧未完了62変種のうち30変種には新たな完走系列があり、32変種は対象面の未対応が残る。これらは計測の完了数であり、脆弱性の検出数や検出率ではない。特にB0240のWebSocket frameやB0245の署名鍵境界について、ZAPが根本原因へ到達したことを完走だけから推定しない。alertと実HTTP要求・応答の人間レビューは別途必要。

オフライン資料は`reports.cmd`または`reports.sh`で再作成する。最新の件数は`artifacts/coverage-inventory.json`、`artifacts/evidence-linkage.json`、`artifacts/artifact-audit.json`を参照する。
