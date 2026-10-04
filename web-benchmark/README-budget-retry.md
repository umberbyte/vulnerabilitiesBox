# 要求数上限で停止した23変種の再計測準備

2026-10-04のコアDAST台帳では、23変種のV/F/Nがすべて `request_budget` で停止した。旧条件は各armにつき最大700 HTTP要求、最大60秒だった。停止は診断完了や未検出を意味しない。

2026-10-05に、同じ23変種の69セル（各変種のV/F/N）について、まず要求数1500、時間180秒の計画をローカルDockerの `panel` toolsモードで作成した。23変種の集合、各arm、認証モード、`active` プロファイル、当初の `not_run` 状態が保存済みの未完了一覧と一致することを確認した。その後の実測と追加条件は下記に記録する。計画だけを検出率には算入しない。

| 計画（`artifacts/` 以下のローカルファイル） | 変種 | セル | 認証 |
|---|---:|---:|---|
| `plan-budget-additional-nine-20261005.json` | 9 | 27 | session / alice |
| `plan-budget-anonymous-three-20261005.json` | 3 | 9 | anonymous |
| `plan-budget-session-eleven-20261005.json` | 11 | 33 | session / alice |

計画ファイルは非公開のローカル成果物としてGitの管理対象外に置く。別PCでは `web-benchmark` ディレクトリから、次のコマンドで再作成できる。`panel` サービスは `network_mode: none` のため、この段階で対象アプリやZAPへの診断通信は発生しない。

```sh
docker compose --profile panel run --rm --entrypoint node panel src/runner/generate-variant-panel.mjs artifacts/plan-budget-additional-nine-20261005.json --variants B0312,B0315,B0317,B0318,B0320,B0321,B0322,B0327,B0328 --profile active --seed core-budget-20261005 --wall-seconds 180 --requests 1500
docker compose --profile panel run --rm panel generate artifacts/plan-budget-anonymous-three-20261005.json --roots R0141,R0235,R0324 --seeds core-budget-20261005 --profiles active --auth anonymous --wall-seconds 180 --requests 1500
docker compose --profile panel run --rm panel generate artifacts/plan-budget-session-eleven-20261005.json --roots R0143,R0146,R0149,R0151,R0152,R0153,R0154,R0156,R0157,R0158,R0329 --seeds core-budget-20261005 --profiles active --auth session --user alice --wall-seconds 180 --requests 1500
```

実行時は旧計測を上書きせず、新しいplan・ledger・runを保存する。V/F/Nでseed・認証・ZAP画像・add-on・設定をそろえ、スキャン時の対象ソースと依存サービスの環境IDも記録する。予算停止が再発した場合は停止理由を残し、検出漏れや陰性には分類しない。B0335は別件のブラウザー成立確認が未完了であり、この23変種には含まれない。

## 2026-10-05の実測と証拠の範囲

23変種について、最終的に各V/F/Nが完了したZAP系列を保存した。21変種は1500要求・180秒で完了し、B0149とB0153は3000要求・300秒の別系列で完了した。途中の1500要求系列ではB0149のV/F/NとB0153-Vが要求数上限で停止し、B0153-Fは認証の事後確認前に予算を使い切って `auth_budget_exhausted` となった。元の失敗run・停止runと中断台帳は削除していない。B0153-Nと後続5変種は新しい計画に分けて実行した。

集計が読み込む台帳名は必ず `ledger.json` で終える。保存済み台帳は `artifacts/budget-anonymous-three-20261005-ledger.json`、`budget-additional-nine-20261005-ledger.json`、`budget-session-eleven-20261005-ledger.json`（中断）、`budget-session-followup-five-20261005-ledger.json`、`budget-3000-two-20261005-ledger.json`。計画・台帳・各run・HTMLレポートはローカル `artifacts/` にあり、Git公開物には含めない。

同じ実行ソースでの成立確認を取り直した結果、23変種すべてで個別V/F/N成立記録と完了したZAP系列のソースが一致した。B0329は代表テストに検査項目がなく初回に `Uncovered root` が出たため、その原レポートを保存して集計では「テスト対象外」と警告し、実装済みの個別変種テストで別途V/F/Nを確認した。個別変種テストの初回も送信先の指定漏れで `fetch failed` となったが、原レポートを残し、Docker内の `https://app:8443` を指定した再実行で9変種・27セルが合格した。

再生成した `artifacts/evidence-linkage.json` では、500変種中250変種に完了スキャン系列があり、ソース対応付け済みは24変種（この23変種と既存のB0011）である。依存サービスの環境まで完全に対応付けられた件数は0。今回の各系列について実行中と終了後のアプリ・DB・Redis・Mongo・LDAP・executorのコンテナIDとイメージIDをローカルに保存して一致を確認したが、DB内容やRedis状態まで同一だった証明ではない。ZAPの完走は対象欠陥の検出、陰性、検出率を意味しない。評価にはalertの対象操作・要求応答・実影響のレビューが残る。
