# meetrail-site

スマートフォンアプリ **ミトレル (Meetrail)** の公式サイト。

- 公開 URL: https://sekai-nina.github.io/meetrail-site/
- アプリ本体のリポジトリ: [sekai-nina/meet-greet-app](https://github.com/sekai-nina/meet-greet-app)

<p align="left">
  <img src="assets/icon.png" alt="ミトレル アイコン" width="110">
</p>

## このサイトの目的

1. **App Store 審査の必須リンクを用意する** — プライバシーポリシー URL とサポート URL
2. **アプリを紹介する** — 「〇〇したいとき」のユースケース単位で、何ができるかを伝える
3. **使い方を説明する** — 問い合わせの前に自己解決してもらう

ミトレルは日向坂46 のミート&グリート (ミーグリ) の記録・計画アプリで、**ファンによる非公式アプリ**。
そのため全ページのフッターに非公式である旨の注記を入れている。

## ページ構成

| ファイル | 用途 | 備考 |
|---|---|---|
| `index.html` | LP | ヒーロー / ユースケース / 画面 / 記録の扱い |
| `guide.html` | 使い方 | はじめかた (フロー) + 機能一覧 (タブ別) |
| `faq.html` | よくある質問 | |
| `support.html` | お問い合わせ | **App Store の「サポート URL」に指定する** |
| `privacy.html` | プライバシーポリシー | **App Store の「プライバシーポリシー URL」に指定する** |
| `terms.html` | 利用規約 | |
| `delete-account.html` | データの削除について | Google Play のデータ削除 URL 要件にも対応 |
| `changelog.html` | 更新履歴 | 公開後に追記していく |
| `assets/style.css` | 共通スタイル | 色トークンはアプリの確定トーンを移植 |
| `assets/shots/` | スクリーンショット置き場 | 現在は空 (LP は枠だけのプレースホルダ) |

ビルド不要の素の HTML。`main` ブランチの root をそのまま GitHub Pages で配信する。

## デプロイ

`main` に push すれば反映される。GitHub Pages の設定は次のとおり。

- Settings → Pages → Source: **Deploy from a branch**
- Branch: **main** / フォルダ: **/ (root)**

`.nojekyll` を置いているため Jekyll のビルドは走らず、ファイルがそのまま配信される。

## ローカルでの確認

```bash
python3 -m http.server 8000
# → http://localhost:8000/
```

`file://` で直接開いても表示できるが、相対パスの挙動を本番と揃えるためサーバー経由を推奨。

## リリース時にやること

公開前に差し替えが必要な箇所には、HTML 内にコメントを入れてある。

- [ ] `index.html` のヒーロー CTA — `<span class="btn btn--disabled">App Store で近日公開</span>` を App Store へのリンクに差し替える
- [ ] `index.html` の「まもなく公開します」セクションを、公開後の文面に書き換える
- [ ] `assets/shots/` にスクリーンショットを入れ、`index.html` の `.shot__frame` の中身を `<img>` に差し替える
- [ ] `changelog.html` に初回リリースの項目を追加する
- [ ] `faq.html` の Android 版に関する記述を、実際の方針に合わせて更新する

## デザイン

アプリの「確定トーン」パレットをそのまま Web に移植している。値の出典はアプリ側の
`tailwind.config.js` / `lib/theme-colors.ts`。

| 用途 | 色 |
|---|---|
| 背景 (紙) | `#FBF8F1` |
| 文字 (茶系 ink) | `#2A2520` |
| ブランド (空色) | `#5BBEE5` |
| アクセント (計画金) | `#C9A24B` |
| リンク | `#42A8C9` |
| 罫線 | `#E2DACB` |

フォントは Google Fonts の **LINE Seed JP** (アプリと同一)。

## 運営者

- 運営者: 世界新奈
- 連絡先: sekainina.project@gmail.com

---

ミトレル (Meetrail) はファンが個人で開発している非公式アプリです。日向坂46 およびその運営・関係各社とは一切関係がありません。
