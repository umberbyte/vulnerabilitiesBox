# 要求数上限で停止した23変種の再計測準備

2026-10-04のコアDAST台帳では、23変種のV/F/Nがすべて `request_budget` で停止した。旧条件は各armにつき最大700 HTTP要求、最大60秒だった。停止は診断完了や未検出を意味しない。

2026-10-05に、同じ23変種の69セル（各変種のV/F/N）について、要求数1500、時間180秒の新しい**計画だけ**をローカルDockerの `panel` toolsモードで作成した。23変種の集合、各arm、認証モード、`active` プロファイル、`not_run` 状態が保存済みの未完了一覧と一致することを確認した。これはZAPの再スキャン結果ではなく、検出率にも算入しない。上限を広げても十分かどうかは実測で判断する。

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
