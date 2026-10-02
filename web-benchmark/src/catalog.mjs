import {definitions as caseDefinitions,variantDefinitions} from './cases/index.mjs';

const originalCases = [
  ['R0001','B0001','検索','search','SQL値の再解釈'],
  ['R0021','B0021','メッセージ','message','HTMLテキスト出力'],
  ['R0041','B0041','プレビュー','preview','DOM innerHTML'],
  ['R0124','B0124','文書閲覧','files','経路とファイル区切り'],
  ['R0141','B0141','拡張機能登録','extensions','実行領域へのアップロード'],
  ['R0182','B0182','ログイン','account','認証結果の真偽判定'],
  ['R0201','B0201','パスワード再設定','recovery','予測可能な再設定トークン'],
  ['R0221','B0221','会員セッション','session','セッション固定'],
  ['R0241','B0241','会員API','api','JWT none'],
  ['R0251','B0251','外部ログイン','connect','OAuth state'],
  ['R0271','B0271','共有文書','documents','オブジェクト認可'],
  ['R0291','B0291','管理操作','management','機能認可'],
  ['R0311','B0311','連絡先変更','profile','CSRFトークン'],
  ['R0332','B0332','連携API','integration','CORS null origin'],
  ['R0380','B0380','公開ニュース','news','エラーキャッシュ汚染'],
  ['R0391','B0391','購入','shop','クライアント指定価格']
].map(([root,variant,title,feature,family])=>({root,variant,title,feature,family}));
export const cases = [...originalCases,...caseDefinitions];
export const variantCases=[...variantDefinitions];
export function findCase(root,variant) {
  const item=variant===undefined?cases.find(c=>c.root===root):[...cases,...variantCases].find(c=>c.root===root&&c.variant===variant);
  if(!item)throw new Error(variant===undefined?'Unknown root':'Unknown root/variant pair');
  return item;
}
