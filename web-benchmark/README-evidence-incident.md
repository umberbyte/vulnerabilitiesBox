# 成立確認の原本欠損と証拠の扱い（2026-10-05）

2026-10-05 01:46 UTC頃、3 rootに絞るつもりで起動した`verify`コンテナーへ`BENCHMARK_TEST_ROOT`と`BENCHMARK_ACCEPTANCE_OUTPUT`を渡せていませんでした。実行は全rootと既定の出力名`artifacts/acceptance.json`を使い、停止時の途中結果（95セル、94合格、1中断失敗）で、従前の`acceptance.json`を上書きしました。途中結果は`artifacts/diagnostic-acceptance-unfiltered-interrupted-20261005.json`へ隔離しました。

上書き前の`acceptance.json`は、2026-10-04の代表210変種・630セルの記録で、629合格、B0226-Vの1失敗でした。同一JSONのバックアップは見つからず、**旧原本の個別チェック内容は復元できていません**。旧失敗の事実は`artifacts/full-regression-logs/representative-acceptance.log`のB0226-V行、`artifacts/full-regression.json`の集計、および上書き前に生成した`artifacts/diagnostic-before-acceptance-overwrite-coverage-inventory.json`で確認できます。これらは旧JSON原本や個別HTTP記録の代替ではありません。旧失敗を現在の成功として書き換えません。

別の作業ディレクトリに残っていた2026-10-02の代表210変種・630セル全合格JSONを、原本とは区別して`artifacts/acceptance-saved-legacy-20261002.json`へコピーしました。コピー前後のファイルSHA-256は`e154a61b5ebb1654f530534051a1fd16db81e368276b4680b924659068000eb5`で一致します。この旧記録にはソースsnapshotがないため、現在のアプリやZAP走査とのソース一致には使いません。

復旧目的で試みた無指定の全rootテストは1011セル中921合格・90失敗でした。対象範囲に成立確認テスト未実装のrootが含まれ、`Uncovered root`となったため、出力を`artifacts/diagnostic-acceptance-all-roots-uncovered-20261005.json`へ隔離し、成立確認の集計には入れていません。その後、R0001・R0005・R0021をコンテナーに明示してV/F/N計9セル・123チェックの合格を`artifacts/acceptance-saved-core-three-current-20261005.json`に保存しました。

現在のオフライン棚卸しは、500変種中499変種にV/F/N合格記録、B0335に個別V/F/N合格記録なし、相反・失敗記録0と表示します。**最後の0は旧B0226-V失敗がなかったことを意味しません。**旧原本欠損のため、機械集計に旧失敗を再投入できない状態です。上書き前の棚卸しは498変種を合格記録あり、B0226を相反・失敗記録あり、B0335を記録未確認と分類していました。両時点の数字を同一の証拠集合として比較しません。

`tests/acceptance.mjs`は、既存の出力ファイル名を実行開始前に拒否し、最終保存も排他的作成に変更しました。再実行には新しい`BENCHMARK_ACCEPTANCE_OUTPUT`名を指定してください。`implementation-status.json`などに残る旧`artifacts/acceptance.json`参照は歴史的な記載であり、現在その原本は存在しません。`artifacts/`内の診断・証拠ファイルは各利用者の非公開ローカル成果物で、GitHubには含みません。
