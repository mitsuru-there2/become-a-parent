# 外部コンポーネント

`src/components/ui/8bit/button.tsx` は [8bitcn/ui](https://www.8bitcn.com/) の公式 [Buttonレジストリ](https://www.8bitcn.com/r/button.json) から2026-09-15に取得。MITライセンス。書式をVitePlusで整形し、日本語の書体を使うローカルretro.cssと、React向けの基礎Buttonへ接続した。外部フォントの通信は行わない。

使用パッケージと固定バージョンはpackage.json、解決された依存関係はbun.lockを参照。各パッケージのライセンスは配布元に帰属する。

## 8bitcn MIT License

MIT License

Copyright (c) 2025 8bitcn

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
