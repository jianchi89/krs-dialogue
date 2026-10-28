/* =========================================================================
 * 对白美化 · 全局 CSS 注入器  v2.5.1
 * -------------------------------------------------------------------------
 * 【为什么需要它 / v2.0.0 的由来】
 *   酒馆会把消息里的所有 class 改名：nvn-dialogue → custom-nvn-dialogue
 *   （见酒馆本体 public/scripts/chats.js 的 addDOMPurifyHooks()）。
 *   消息自带的 <style> 也会被同步改写成 .mes_text .custom-nvn-*，
 *   所以「把原样 CSS 挂到 <head>」匹配不到任何元素。
 *   本脚本里的 CSS 是用酒馆自己的 decodeStyleTags() 跑出来的结果，实测生效。
 *
 *   另外：旧版把约 22 万字符 CSS 写进正则替换文本，每条对白复制一份，
 *   而且酒馆每次渲染都要 css.parse()+css.stringify() 一遍这段 CSS
 *   （13 句对白 = 每次渲染解析 13 次 22 万字符），流式每个 token 再来一轮。
 *   现在消息里 0 字节 CSS，以上开销全部归零。
 *
 * 【v2.1.0 变化】
 *   1) 中文版与中日双语版合并成一份 light：实测「用双语CSS渲染中文消息」
 *      与中文CSS的计算样式差异为 0 处，而反过来会坏（ruby 注音行高全错）。
 *      所以 light 一份同时管中文与双语 —— 你只切正则，不用碰脚本。
 *   2) 新增 NEW_CHARACTERS 表：以后加角色只改那一处，脚本自动生成规则。
 *
 * 【v2.2.0 修复「玩家行（user 模式）不对」】
 *   原卡写的是「.is_user .nvn-dialogue { flex-direction: row-reverse }」，
 *   但酒馆的 is_user 是 **属性** 不是 class（见 index.html 的
 *   <div class="mes" is_user="true">），酒馆自己的样式表里根本没有 .is_user
 *   这个类 —— 所以这套「玩家行」规则从来没生效过：玩家那一行的头像会跑到
 *   左边、名牌也翻不过去，玩家名一旦和角色名重名就彻底崩。
 *   现在改成 [is_user="true"]，玩家行才真正右对齐。
 *
 *   另外顺手修了两处：
 *     · 原卡 [data-player] 分支里 .nvn-name-plate .nvn-name-plate 这类
 *       重复类名（漏了 5 处），导致即使命中也不会翻名牌；
 *     · 选择器不再统一加 .mes_text 前缀 —— 加了会让 [is_user] /
 *       :is(.dark,.theme-dark) 这类「祖先在消息之外」的规则失效。
 *       需要收窄的 .mes_text 规则改用 :has(.custom-nvn-dialogue) 限定。
 *
 * 【v2.3.0】中日双语字号加大：日语 0.98em → 1.15em；
 *   中文小字 11.5px → 0.8em（em 相对 ruby 基准，故恒为日语的 80%）。
 *
 * 【v2.5.1】星号包裹（*…*）单独走「内心思绪」：标签文案换成「内心思绪」、
 *   引号图标换成 *，且不套心灵感应那套淡紫配色（与普通行同色）。
 *   不带引号也没星号的仍走「心灵感应」。两条兜底正则按此顺序排列。
 *
 * 【v2.6.1】修 NEW_CHARACTERS 的两个「只有新角色才会中」的问题：
 *   1) 颜色不生效：基础 CSS 的「译名首字色池」用 :not() 链把权重堆到 (0,7,1)，
 *      生成的选择器只有 (0,3,1)，同 !important 时输给它 → 「欧里丝」这类
 *      名字首字撞上色池的角色，头像框/引号/动作描写是色池的灰紫色。
 *      现在生成的选择器统一加 :not(#nvn-char-color-override) 提权。
 *   2) 头像多一圈细框：基础 CSS 只对「旧名单以外」的角色画 .custom-nvn-avatar-img::after
 *      的 4px 内嵌细框；新角色不在旧名单里，于是有立绘也被套上这圈框。
 *      现在凡是有 avatar 的角色都把 ::after 关掉，和盖欧这类老角色一致（整块填满）。
 *
 * 【依赖】酒馆助手。关掉它对白会失去样式；此时可把同目录的
 *         「对白美化-自定义CSS版-中文与双语通用.css」整段粘进
 *         酒馆「用户设置 → 自定义CSS」。
 * ========================================================================= */
(async function () {
  'use strict';

  const VERSION  = '2.6.1';
  const STYLE_ID = 'nvn-dialogue-theme-css';
  const SLOT     = '__NVN_DLG_CSS__';

  /* =========================================================================
   * ★★★ 新增角色 —— 只改这里 ★★★
   * -------------------------------------------------------------------------
   * 往下面数组里加一条就行，脚本会自动生成酒馆改名后的选择器，无需手写 CSS。
   *
   *   chars    : 对白里的角色名，可写多个别名（全名 / 短名 / 异体字），必须精确
   *   main     : 主色（名牌、引号、边框）        sub  : 副色（动作描写）
   *   rgb      : main 的 "R, G, B" 十进制写法（三个数字间用逗号+空格）
   *   motion   : 动作描写颜色，省略则用 main
   *   avatar   : 100×125 小头像图片地址
   *   portrait : 点开头像看的大立绘地址（可选）
   *   rose     : true  → 显示蔷薇花名牌（建议给主要角色开）
   *   big      : true  → 手型指针 + 隐藏字母兜底（有大立绘时开）
   *
   * 示例（把 // 去掉即可）：
   *   { chars: ['新角色', '新角色·全名'], main: '#c9a227', sub: '#fffdf5',
   *     rgb: '201, 162, 39', motion: '#e0c060', rose: true, big: true,
   *     avatar:   'https://origin.picgo.net/2026/10/09/xxxx.png',
   *     portrait: 'https://origin.picgo.net/2026/10/09/yyyy.png' },
   * ========================================================================= */
  const NEW_CHARACTERS = [
    { chars: ["鮟鱇鱼娘"], main: '#b25734', sub: '#d4a28f', rgb: '178, 87, 52', avatar: "https://origin.picgo.net/2026/10/28/44f2e1643741ecd0da82c23b6fd301fbaaa0d20c1ef92a18.png", big: true, rose: true },
    { chars: ["霸王花娘"], main: '#50b25a', sub: '#9ed4a4', rgb: '80, 178, 90', avatar: "https://origin.picgo.net/2026/10/28/b489acf2fde4a0c566c4952dcf63ccbce2db3461ac1a81b2.png", big: true, rose: true },
    { chars: ["白熊娘"], main: '#a8814a', sub: '#c9a86a', rgb: '168,129,74', avatar: "https://origin.picgo.net/2026/10/28/d06e867bdcd8bd74a027d6bb10a87235147698be72320237.png", big: true, rose: true },
    { chars: ["宝箱娘"], main: '#b22e20', sub: '#d48c84', rgb: '178, 46, 32', avatar: "https://origin.picgo.net/2026/10/28/149e8e30cddb31f23fdecff3e5ce9c302c4b72d16effc6d5.png", big: true, rose: true },
    { chars: ["贝娘"], main: '#e08164', sub: '#edb9a9', rgb: '224, 129, 100', avatar: "https://origin.picgo.net/2026/10/28/19573c5253e693a1395b6a557aa010e542f964650124fba6.png", big: true, rose: true },
    { chars: ["贝希摩斯娘"], main: '#b25720', sub: '#d4a284', rgb: '178, 87, 32', avatar: "https://origin.picgo.net/2026/10/28/227dbe3c05c8c146bc895d5ac72e6bf619d4ceb9cc86feaa.png", big: true, rose: true },
    { chars: ["不死鸟娘(phoenixb)"], main: '#e05328', sub: '#eda088', rgb: '224, 83, 40', avatar: "https://origin.picgo.net/2026/10/28/phoenixb12003dc9be75b012.png", big: true, rose: true },
    { chars: ["不死鸟娘"], main: '#e05228', sub: '#ed9f88', rgb: '224, 82, 40', avatar: "https://origin.picgo.net/2026/10/28/6c03c6e2960bd2dafd431cf4af795959dce5cc46f5ec1e63.png", big: true, rose: true },
    { chars: ["蚕娘"], main: '#b28e50', sub: '#d4c09e', rgb: '178, 142, 80', avatar: "https://origin.picgo.net/2026/10/28/bfb0d6ce2862295bedb2dfa81de96707954ee76a1b07c8c9.png", big: true, rose: true },
    { chars: ["达贡娘"], main: '#b23a32', sub: '#d4928e', rgb: '178, 58, 50', avatar: "https://origin.picgo.net/2026/10/28/dc597846d86ac575f3815bda6b3512790479a8da70b35906.png", big: true, rose: true },
    { chars: ["冬贝利娘"], main: '#63c458', sub: '#a9dea3', rgb: '99, 196, 88', avatar: "https://origin.picgo.net/2026/10/28/9affa1a56bdd912f92f26792f9cf7c274af0de9126085686.png", big: true, rose: true },
    { chars: ["独角鲸娘"], main: '#5469bb', sub: '#a0acd9', rgb: '84, 105, 187', avatar: "https://origin.picgo.net/2026/10/28/c3cb2272aa1b374e02d06ca0807b9f273cdc2400f3d031cf.png", big: true, rose: true },
    { chars: ["蛾娘"], main: '#b2764d', sub: '#d4b39d', rgb: '178, 118, 77', avatar: "https://origin.picgo.net/2026/10/28/9d3de488dd2d4a3ce893ce6044b5d8a9632258326d18495f.png", big: true, rose: true },
    { chars: ["鳄鱼娘"], main: '#7db250', sub: '#b7d49e', rgb: '125, 178, 80', avatar: "https://origin.picgo.net/2026/10/28/8d9ebd301d1568a0d7d74bf73aa409c6f42fc952b9b2a1f4.png", big: true, rose: true },
    { chars: ["二口娘"], main: '#89b250', sub: '#bed49e', rgb: '137, 178, 80', avatar: "https://origin.picgo.net/2026/10/28/f80a0efb590efc977f83b719fc0d235f8114e0d320194a7a.png", big: true, rose: true },
    { chars: ["飞机杯娘"], main: '#e0288e', sub: '#ed88c0', rgb: '224, 40, 142', avatar: "https://origin.picgo.net/2026/10/28/43558e4db7606899a4ffcaa8197d940fdab18d7f13bae403.png", big: true, rose: true },
    { chars: ["废品人偶娘"], main: '#b22d3d', sub: '#d48b94', rgb: '178, 45, 61', avatar: "https://origin.picgo.net/2026/10/28/25c4f7615b44363bc43ec997febb565d6f4c75f4b59b068f.png", big: true, rose: true },
    { chars: ["凤蝶娘"], main: '#b23931', sub: '#d4928d', rgb: '178, 57, 49', avatar: "https://origin.picgo.net/2026/10/28/6c7c4126ebd870f384689e03621f126f5d37b8e830a093bb.png", big: true, rose: true },
    { chars: ["蝠鲼娘"], main: '#5950b2', sub: '#a39ed4', rgb: '89, 80, 178', avatar: "https://origin.picgo.net/2026/10/28/ef3ab8dbe1c48a1dadda945156297d9d4b43f330d74d9c6c.png", big: true, rose: true },
    { chars: ["高阶蛞蝓娘"], main: '#b29b50', sub: '#d4c89e', rgb: '178, 155, 80', avatar: "https://origin.picgo.net/2026/10/28/a8316ba69729986cd437e5f89dadff0d96f8474774c4586c.png", big: true, rose: true },
    { chars: ["哥布林娘"], main: '#b26621', sub: '#d4aa84', rgb: '178, 102, 33', avatar: "https://origin.picgo.net/2026/10/28/7da4053e2bdba9264792d0df2380df251610ac5c4048d158.png", big: true, rose: true },
    { chars: ["果冻娘"], main: '#21b7a0', sub: '#84d7ca', rgb: '33, 183, 160', avatar: "https://origin.picgo.net/2026/10/28/1ce8e65b3e8d6a3e3a2ad1a01a89bfcc488fbf53979370c6.png", big: true, rose: true },
    { chars: ["海参娘"], main: '#b72031', sub: '#d7848d', rgb: '183, 32, 49', avatar: "https://origin.picgo.net/2026/10/28/f96ce747a62a795b547eb458ba8b4b4303fe19f2939f9419.png", big: true, rose: true },
    { chars: ["海葵娘"], main: '#c92846', sub: '#e18899', rgb: '201, 40, 70', avatar: "https://origin.picgo.net/2026/10/28/d6e7f4c8e4a97ffcd9985ca209017c5d3b7bfb7fe7800f44.png", big: true, rose: true },
    { chars: ["海鳝娘"], main: '#e08564', sub: '#edbba9', rgb: '224, 133, 100', avatar: "https://origin.picgo.net/2026/10/28/3bdc7f5dca18d9175ffbb8000b92c684609af71b974af25b.png", big: true, rose: true },
    { chars: ["海市蜃楼娘"], main: '#2089b2', sub: '#84bed4', rgb: '32, 137, 178', avatar: "https://origin.picgo.net/2026/10/28/93b671912fd7ee3fc928288adde8c98fd2c56a41f193b7df.png", big: true, rose: true },
    { chars: ["海星娘"], main: '#505bb2', sub: '#9ea4d4', rgb: '80, 91, 178', avatar: "https://origin.picgo.net/2026/10/28/afcd4a239528a294cf33f39bcffa038941aab69aaf833172.png", big: true, rose: true },
    { chars: ["胡蜂娘"], main: '#bb215b', sub: '#d984a4', rgb: '187, 33, 91', avatar: "https://origin.picgo.net/2026/10/28/6fba0dafb2e10603c9f93726b88c7a407f7e6297a0db4304.png", big: true, rose: true },
    { chars: ["虎娘"], main: '#c4a139', sub: '#decb92', rgb: '196, 161, 57', avatar: "https://origin.picgo.net/2026/10/28/bb242ddac07413c1df0cef45c5add9916db17a7ca4490d7d.png", big: true, rose: true },
    { chars: ["画像娘"], main: '#dea550', sub: '#eccd9e', rgb: '222, 165, 80', avatar: "https://origin.picgo.net/2026/10/28/173a36f99b454ae5cd0706d25356308c81d10bf6a275c921.png", big: true, rose: true },
    { chars: ["灰熊娘"], main: '#b25849', sub: '#d4a39a', rgb: '178, 88, 73', avatar: "https://origin.picgo.net/2026/10/28/b0c9e21e8a78c9bf733b89dbf9dd9599443aa0afe5ae4a77.png", big: true, rose: true },
    { chars: ["鸡蛇娘"], main: '#bc2127', sub: '#da8488', rgb: '188, 33, 39', avatar: "https://origin.picgo.net/2026/10/28/97663b1e7485b4a77c352337cffcf53628a8849fe30b1313.png", big: true, rose: true },
    { chars: ["僵尸龙娘"], main: '#b23241', sub: '#d48e96', rgb: '178, 50, 65', avatar: "https://origin.picgo.net/2026/10/28/acbd0bef472527ea9c2a09a5230939413f05513fdfab3cb4.png", big: true, rose: true },
    { chars: ["巨龙娘"], main: '#b23947', sub: '#d49299', rgb: '178, 57, 71', avatar: "https://origin.picgo.net/2026/10/28/27a3937bdc7d00e47a2f0af21c5a4ba528b6ee6f24de6ba8.png", big: true, rose: true },
    { chars: ["巨人娘"], main: '#50b276', sub: '#9ed4b3', rgb: '80, 178, 118', avatar: "https://origin.picgo.net/2026/10/28/fed05c34d0da6daba27b3b49ca1d9b73c5f3ad72a99c4c87.png", big: true, rose: true },
    { chars: ["剧毒史莱姆娘"], main: '#3eb293', sub: '#94d4c3', rgb: '62, 178, 147', avatar: "https://origin.picgo.net/2026/10/28/6f79cf8764861e06c057f700fa9518496b3568053716b714.png", big: true, rose: true },
    { chars: ["攫速者娘"], main: '#e05a6e', sub: '#eda4af', rgb: '224, 90, 110', avatar: "https://origin.picgo.net/2026/10/28/771df7f5cf5bbd621eb297d831e830b75eec25aeb83b8ad3.png", big: true, rose: true },
    { chars: ["卡班克尔娘"], main: '#6cc92d', sub: '#aee18b', rgb: '108, 201, 45', avatar: "https://origin.picgo.net/2026/10/28/823e5c6d5fae7d4511a96dd763203e8fe2058c2b794ce069.png", big: true, rose: true },
    { chars: ["昆虫娘们"], main: '#b2774e', sub: '#d4b49d', rgb: '178, 119, 78', avatar: "https://origin.picgo.net/2026/10/28/ac23439aaaa06913ba4cb6d19ece598cd0eb94cd93c6f0c0.png", big: true, rose: true },
    { chars: ["蛞蝓娘"], main: '#b26750', sub: '#d4ab9e', rgb: '178, 103, 80', avatar: "https://origin.picgo.net/2026/10/28/4056ea62df98291fbfb1e0b13787900fb063c246bd34c112.png", big: true, rose: true },
    { chars: ["蜡烛娘"], main: '#4a85e0', sub: '#9bbbed', rgb: '74, 133, 224', avatar: "https://origin.picgo.net/2026/10/28/e951dc82909cd2280afbc86c4ae3c41e2407a7b2ec678c46.png", big: true, rose: true },
    { chars: ["兰花螳螂娘"], main: '#974bb2', sub: '#c59cd4', rgb: '151, 75, 178', avatar: "https://origin.picgo.net/2026/10/28/b3702fbc22d26cdba63bcd00025950efa428641cec854f43.png", big: true, rose: true },
    { chars: ["狼娘"], main: '#db7152', sub: '#ebb09f', rgb: '219, 113, 82', avatar: "https://origin.picgo.net/2026/10/28/e4a4e63aaad607b3f5f35225af54a3821dbce9891e86047b.png", big: true, rose: true },
    { chars: ["利维坦娘"], main: '#204db2', sub: '#849dd4', rgb: '32, 77, 178', avatar: "https://origin.picgo.net/2026/10/28/e6697f9fec4c2bc5716a4ad031dbb70a36226f493c19224c.png", big: true, rose: true },
    { chars: ["龙娘"], main: '#bb2a24', sub: '#d98986', rgb: '187, 42, 36', avatar: "https://origin.picgo.net/2026/10/28/ee266da4b3714e8894b5636503efe0f98bae5bd5c61e4bc1.png", big: true, rose: true },
    { chars: ["龙鸟娘"], main: '#e07f28', sub: '#edb888', rgb: '224, 127, 40', avatar: "https://origin.picgo.net/2026/10/28/34dc5fdfc40f1006ffb435b4f20f628d84aa98ed26360d13.png", big: true, rose: true },
    { chars: ["麻雀娘"], main: '#b24820', sub: '#d49a84', rgb: '178, 72, 32', avatar: "https://origin.picgo.net/2026/10/28/c38e093adf99c4b34e4c7327040d778566876383b3a64cda.png", big: true, rose: true },
    { chars: ["马可西亚斯娘"], main: '#a8b24d', sub: '#cfd49d', rgb: '168, 178, 77', avatar: "https://origin.picgo.net/2026/10/28/a2872d4bc680e6005a1f0b91ea413e2394c3c4d85f82e113.png", big: true, rose: true },
    { chars: ["马人娘"], main: '#b2664c', sub: '#d4aa9c', rgb: '178, 102, 76', avatar: "https://origin.picgo.net/2026/10/28/9902fd129b9061353298fd36142aeb0e968aafff64d69d45.png", big: true, rose: true },
    { chars: ["曼德拉娘"], main: '#9eb220', sub: '#c9d484', rgb: '158, 178, 32', avatar: "https://origin.picgo.net/2026/10/28/23bf9fce5804ca6c25fadce20c2c84656634f0eadf768e14.png", big: true, rose: true },
    { chars: ["毛毛虫娘"], main: '#b2ad50', sub: '#d4d19e', rgb: '178, 173, 80', avatar: "https://origin.picgo.net/2026/10/28/ae65ff49d8e0b05401d2120a0f5e173d4605897c1ef01fcb.png", big: true, rose: true },
    { chars: ["梅达娘"], main: '#ba7c21', sub: '#d9b684', rgb: '186, 124, 33', avatar: "https://origin.picgo.net/2026/10/28/beed1adf3299ed0225cbdb3d4141d478ed857a2b902acb65.png", big: true, rose: true },
    { chars: ["迷你蟹娘"], main: '#d73158', sub: '#e98da3', rgb: '215, 49, 88', avatar: "https://origin.picgo.net/2026/10/28/9c4faeeaae94d444f80f1d7cb3f08ddb29ed346ae3256bb2.png", big: true, rose: true },
    { chars: ["米诺陶洛斯娘"], main: '#c9394b', sub: '#e1929c', rgb: '201, 57, 75', avatar: "https://origin.picgo.net/2026/10/28/4086af7596adf7e044feef1d465ac7ea1c3454f84e80467a.png", big: true, rose: true },
    { chars: ["蜜蜂娘"], main: '#e0d464', sub: '#ede7a9', rgb: '224, 212, 100', avatar: "https://origin.picgo.net/2026/10/28/a0e39c3c74c55d67a0aabc3ae6ddd5c9056aef47d73d2ddc.png", big: true, rose: true },
    { chars: ["蘑菇娘"], main: '#d56c4d', sub: '#e7ae9d', rgb: '213, 108, 77', avatar: "https://origin.picgo.net/2026/10/28/409be64aa8a1d1089b0a18a422236fee36fc7ae0f01b90ed.png", big: true, rose: true },
    { chars: ["魔界花娘"], main: '#b2564d', sub: '#d4a29d', rgb: '178, 86, 77', avatar: "https://origin.picgo.net/2026/10/28/7fdc562709ff0ac5cf675c44effa2cff3d3611561c24f2cb.png", big: true, rose: true },
    { chars: ["魔像娘"], main: '#b2874b', sub: '#d4bd9c', rgb: '178, 135, 75', avatar: "https://origin.picgo.net/2026/10/28/468b1345421e33dcf9ac8c9308135103d24053af47726eff.png", big: true, rose: true },
    { chars: ["木乃伊娘"], main: '#b2393f', sub: '#d49295', rgb: '178, 57, 63', avatar: "https://origin.picgo.net/2026/10/28/d6181f38a11bbf26f6a795fd880a183cf6af3ab56b373992.png", big: true, rose: true },
    { chars: ["鲶鱼娘"], main: '#d23725', sub: '#e69187', rgb: '210, 55, 37', avatar: "https://origin.picgo.net/2026/10/28/f1e184db6d7c73d52fbacd1296b23e9487bb7dd3f7d15a25.png", big: true, rose: true },
    { chars: ["凝胶立方娘"], main: '#45c4b6', sub: '#98ded6', rgb: '69, 196, 182', avatar: "https://origin.picgo.net/2026/10/28/8039a9215c6ff1b1c7a671d7645ffca95c389b76979af847.png", big: true, rose: true },
    { chars: ["螃蟹娘"], main: '#b22232', sub: '#d4858e', rgb: '178, 34, 50', avatar: "https://origin.picgo.net/2026/10/28/516031421b3ac1c2f9391fc5dbf2398f797de8167678c0b7.png", big: true, rose: true },
    { chars: ["青蛙娘"], main: '#9ab250', sub: '#c7d49e', rgb: '154, 178, 80', avatar: "https://origin.picgo.net/2026/10/28/5ce3aaa869b9fbc5561cb3f5db5101e1db582ab31fedd900.png", big: true, rose: true },
    { chars: ["蚯蚓娘"], main: '#b27247', sub: '#d4b199', rgb: '178, 114, 71', avatar: "https://origin.picgo.net/2026/10/28/a585c7dc9295e9fd04315896684c370b0d2da993f1816cec.png", big: true, rose: true },
    { chars: ["犬娘"], main: '#b25096', sub: '#d49ec5', rgb: '178, 80, 150', avatar: "https://origin.picgo.net/2026/10/28/99558077efd65ae58f060915964700312a0010988cc31117.png", big: true, rose: true },
    { chars: ["裙带菜娘"], main: '#b2ad50', sub: '#d4d19e', rgb: '178, 173, 80', avatar: "https://origin.picgo.net/2026/10/28/2bb68a641fada892348336371fab48a3df1c9657ee97bdd8.png", big: true, rose: true },
    { chars: ["人魂娘"], main: '#437dbb', sub: '#97b7d9', rgb: '67, 125, 187', avatar: "https://origin.picgo.net/2026/10/28/724112a33a472aeff23dd9d94f93df62700db6d19ba0205a.png", big: true, rose: true },
    { chars: ["熔岩娘"], main: '#e04428', sub: '#ed9888', rgb: '224, 68, 40', avatar: "https://origin.picgo.net/2026/10/28/67b54f4f1e09ca962fe2b770589a23fba08e040dca3ad977.png", big: true, rose: true },
    { chars: ["沙虫娘"], main: '#8cb250', sub: '#bfd49e', rgb: '140, 178, 80', avatar: "https://origin.picgo.net/2026/10/28/bb15ee0bf69143350d1962490c544f51dc810ecad255a3bd.png", big: true, rose: true },
    { chars: ["沙拉克娘"], main: '#b22031', sub: '#d4848d', rgb: '178, 32, 49', avatar: "https://origin.picgo.net/2026/10/28/3b8d93d28356bfe5d4a831835964a0bdd81fd6afbe82e863.png", big: true, rose: true },
    { chars: ["珊瑚娘"], main: '#50aab2', sub: '#9ed0d4', rgb: '80, 170, 178', avatar: "https://origin.picgo.net/2026/10/28/a95b9e2781ffda815b748e8ea37a1dbd353745667ddbcb73.png", big: true, rose: true },
    { chars: ["石像鬼娘"], main: '#b24941', sub: '#d49a96', rgb: '178, 73, 65', avatar: "https://origin.picgo.net/2026/10/28/3b46c91efce6e5fa8a62b73337cd8435260d2a5de54f715a.png", big: true, rose: true },
    { chars: ["食蚁兽娘"], main: '#5050b2', sub: '#9e9ed4', rgb: '80, 80, 178', avatar: "https://origin.picgo.net/2026/10/28/fc4d6fc80b7d3ee6d7bf4313ff8b6eef2468f6c4db8c658b.png", big: true, rose: true },
    { chars: ["史莱姆贝丝娘"], main: '#d15e7b', sub: '#e5a6b6', rgb: '209, 94, 123', avatar: "https://origin.picgo.net/2026/10/28/ee51dfe0bc107b7401f0e2c53f97cece22ef815b8a642556.png", big: true, rose: true },
    { chars: ["史莱姆娘"], main: '#274ed9', sub: '#889dea', rgb: '39, 78, 217', avatar: "https://origin.picgo.net/2026/10/28/57e44bb34c4ea2dc8c1e34162f63c998bceffb545c66300b.png", big: true, rose: true },
    { chars: ["兽人娘"], main: '#e06486', sub: '#eda9bc', rgb: '224, 100, 134', avatar: "https://origin.picgo.net/2026/10/28/09a7bccb99feeb65b099f790a64015042e5abafafec99442.png", big: true, rose: true },
    { chars: ["鼠娘"], main: '#505ab2', sub: '#9ea4d4', rgb: '80, 90, 178', avatar: "https://origin.picgo.net/2026/10/28/c1d906829dc9f6b040caa0ccc884197bf1b52b0d288701f4.png", big: true, rose: true },
    { chars: ["树绳妖娘"], main: '#b25098', sub: '#d49ec6', rgb: '178, 80, 152', avatar: "https://origin.picgo.net/2026/10/28/a11f9d839184bbbce586ff9013d9b518b93e0be9a9f23f28.png", big: true, rose: true },
    { chars: ["水龙娘"], main: '#317bd6', sub: '#8db6e8', rgb: '49, 123, 214', avatar: "https://origin.picgo.net/2026/10/28/8f10c8f38808dc84f70eec66bde24b7f62b1e86db325429a.png", big: true, rose: true },
    { chars: ["水母娘"], main: '#b2352b', sub: '#d48f8a', rgb: '178, 53, 43', avatar: "https://origin.picgo.net/2026/10/28/b1fb03109b1b1f91f358b42bac2e40ce6313cc3e2f7a86f0.png", big: true, rose: true },
    { chars: ["水蛭娘"], main: '#b22020', sub: '#d48484', rgb: '178, 32, 32', avatar: "https://origin.picgo.net/2026/10/28/c61297c82fdb45b60915dc031ba05aa216c3ba0ece3fe5b8.png", big: true, rose: true },
    { chars: ["塔兰图拉毒蛛娘"], main: '#b22030', sub: '#d4848d', rgb: '178, 32, 48', avatar: "https://origin.picgo.net/2026/10/28/ef8b5a170c3cc2ac3e8f2d2ade69c11b834fcaba9977a20d.png", big: true, rose: true },
    { chars: ["螳螂娘"], main: '#80b22f', sub: '#b9d48c', rgb: '128, 178, 47', avatar: "https://origin.picgo.net/2026/10/28/f881f1cce4bc996a93666b255c7d05c36ad38924918cfc53.png", big: true, rose: true },
    { chars: ["涂魔像娘"], main: '#b27b36', sub: '#d4b690', rgb: '178, 123, 54', avatar: "https://origin.picgo.net/2026/10/28/9d9802f81f74c17c033b1ca4b3d33562defe83c56341790b.png", big: true, rose: true },
    { chars: ["兔娘"], main: '#df385e', sub: '#ed91a6', rgb: '223, 56, 94', avatar: "https://origin.picgo.net/2026/10/28/dbc068e68131ecefcb8122e03ad860d299cab8031c32ebbe.png", big: true, rose: true },
    { chars: ["兔子史莱姆娘"], main: '#e05380', sub: '#eda0b9', rgb: '224, 83, 128', avatar: "https://origin.picgo.net/2026/10/28/d81cc92cd1cd00f66c73a6370e678205b5715746842891bb.png", big: true, rose: true },
    { chars: ["鸵鸟娘"], main: '#dc7655', sub: '#ebb3a1', rgb: '220, 118, 85', avatar: "https://origin.picgo.net/2026/10/28/1b0c01f0a17c0c0f4818a7c016eb2f822fc75cc5a4275413.png", big: true, rose: true },
    { chars: ["薇薇尔娘"], main: '#cb8524', sub: '#e2bb86', rgb: '203, 133, 36', avatar: "https://origin.picgo.net/2026/10/28/817818981a0648e5189883a73fe23df6248200060eac64cb.png", big: true, rose: true },
    { chars: ["蚊子娘"], main: '#4d79b2', sub: '#9db5d4', rgb: '77, 121, 178', avatar: "https://origin.picgo.net/2026/10/28/5dcaabb74b97ecf1bf64a13e946760e94f4c3e9ed6baea44.png", big: true, rose: true },
    { chars: ["蜈蚣娘"], main: '#8eb235', sub: '#c0d48f', rgb: '142, 178, 53', avatar: "https://origin.picgo.net/2026/10/28/bf43874c621348d0798da5724b8542586617f6066cc302ad.png", big: true, rose: true },
    { chars: ["西瓜娘"], main: '#e0cd64', sub: '#ede3a9', rgb: '224, 205, 100', avatar: "https://origin.picgo.net/2026/10/28/d8415ebe086db3a27fef15fbbabb97776b1e1ce9b7f935d1.png", big: true, rose: true },
    { chars: ["仙人掌娘"], main: '#dd3227', sub: '#ec8e88', rgb: '221, 50, 39', avatar: "https://origin.picgo.net/2026/10/28/fa44e31e89799d996656df6962d8debdd6bcf8a5c606e359.png", big: true, rose: true },
    { chars: ["蝎娘"], main: '#8a20b2', sub: '#be84d4', rgb: '138, 32, 178', avatar: "https://origin.picgo.net/2026/10/28/75815ec60643409ef0f7350e81c18c4e32b454309600e6e3.png", big: true, rose: true },
    { chars: ["眼镜蛇娘"], main: '#3671b2', sub: '#90b0d4', rgb: '54, 113, 178', avatar: "https://origin.picgo.net/2026/10/28/af25d06b3b5fe5afdea861c074eec9615def28dbaf970459.png", big: true, rose: true },
    { chars: ["羊娘"], main: '#b79920', sub: '#d7c684', rgb: '183, 153, 32', avatar: "https://origin.picgo.net/2026/10/28/be113122b589cce93df2c8c69fdb71cbfd5362124e49222a.png", big: true, rose: true },
    { chars: ["一反木绵娘"], main: '#2f20b2', sub: '#8c84d4', rgb: '47, 32, 178', avatar: "https://origin.picgo.net/2026/10/28/50810cdd4e2ecbfd5e87d065d69f43ae7022cdd61e5326c1.png", big: true, rose: true },
    { chars: ["蚁娘"], main: '#b2784f', sub: '#d4b49e', rgb: '178, 120, 79', avatar: "https://origin.picgo.net/2026/10/28/3907e0ee33a465d89c2c0f6e790696a2ca0cd54633e8b2cb.png", big: true, rose: true },
    { chars: ["蚁狮娘"], main: '#b25072', sub: '#d49eb1', rgb: '178, 80, 114', avatar: "https://origin.picgo.net/2026/10/28/1f9374e90de53237052987c5193db1e1195d55b3e10ea6fc.png", big: true, rose: true },
    { chars: ["隐形虫娘"], main: '#504db2', sub: '#9e9dd4', rgb: '80, 77, 178', avatar: "https://origin.picgo.net/2026/10/28/fb8ba229b3ee96862f7eb393466d4afd38d5299c7fd1079b.png", big: true, rose: true },
    { chars: ["影子娘"], main: '#8a6aa8', sub: '#b79ac9', rgb: '138,106,168', avatar: "https://origin.picgo.net/2026/10/28/3322ef5b93c94aa1bce8b8a3b233f5ce241db1302793c83e.png", big: true, rose: true },
    { chars: ["幽灵娘"], main: '#64c8e0', sub: '#a9e0ed', rgb: '100, 200, 224', avatar: "https://origin.picgo.net/2026/10/28/cf1564b37aafe97ea663fdf8c6789340470d46ee0b866bee.png", big: true, rose: true },
    { chars: ["粘体娘"], main: '#e03c5b', sub: '#ed93a4', rgb: '224, 60, 91', avatar: "https://origin.picgo.net/2026/10/28/ca0df5743898ae2911b58133673d75165fa90e1b4bee8416.png", big: true, rose: true },
    { chars: ["蟑螂娘"], main: '#5750b2', sub: '#a29ed4', rgb: '87, 80, 178', avatar: "https://origin.picgo.net/2026/10/28/ba6f0fc85caefe46e77ffd1cb2e5b927bd6f32c9976adb2c.png", big: true, rose: true },
    { chars: ["蜘蛛娘"], main: '#d76182', sub: '#e9a8ba', rgb: '215, 97, 130', avatar: "https://origin.picgo.net/2026/10/28/84057681c5c653ecc92a2e8c8dca59be8a345c8bb98f462c.png", big: true, rose: true },
    { chars: ["猪笼草娘"], main: '#3eb232', sub: '#94d48e', rgb: '62, 178, 50', avatar: "https://origin.picgo.net/2026/10/28/e7781a22196f499c033de6d23a70e993561c66798cd04f2a.png", big: true, rose: true },
    { chars: ["自动机娘"], main: '#7549b2', sub: '#b39ad4', rgb: '117, 73, 178', avatar: "https://origin.picgo.net/2026/10/28/ae4dd049804105743354608bb5dc0f778de664b9e308f2b0.png", big: true, rose: true },
    { chars: ["诅咒人偶娘"], main: '#8650b2', sub: '#bc9ed4', rgb: '134, 80, 178', avatar: "https://origin.picgo.net/2026/10/28/0baf0f85a72fd465c4d6287a59741f7248b78490c42df8b6.png", big: true, rose: true },
    { chars: ["QQ"], main: '#6284da', sub: '#a8bbea', rgb: '98, 132, 218', avatar: "https://origin.picgo.net/2026/10/28/QQc68390a11575fd28.png", big: true, rose: true },
    { chars: ["TT"], main: '#b72e63', sub: '#d78ca9', rgb: '183, 46, 99', avatar: "https://origin.picgo.net/2026/10/28/TTe4d88cca2b1c13de.png", big: true, rose: true },
    { chars: ["阿加利亚雷普特"], main: '#b25097', sub: '#d49ec5', rgb: '178, 80, 151', avatar: "https://origin.picgo.net/2026/10/28/5ff594a5f26a7b2a159ceec474575e6c43083fe5124f2f24.png", big: true, rose: true },
    { chars: ["阿露艾露玛"], main: '#b22520', sub: '#d48784', rgb: '178, 37, 32', avatar: "https://origin.picgo.net/2026/10/28/dcde36d89b1a44cb35858c53cd6c1c652605baeaba81b6b2.png", big: true, rose: true },
    { chars: ["阿皮洛・拉戈斯"], main: '#5d4fc4', sub: '#a59ede', rgb: '93, 79, 196', avatar: "https://origin.picgo.net/2026/10/28/6bfd750e71640a59efb68a6e5b2674ac79bccae9f03f758d.png", big: true, rose: true },
    { chars: ["阿斯塔洛特"], main: '#e03c47', sub: '#ed9399', rgb: '224, 60, 71', avatar: "https://origin.picgo.net/2026/10/28/79eeb4b610d7f18b15154bc3e775af1ec25a69dad7c0f835.png", big: true, rose: true },
    { chars: ["艾克斯・索尼娅"], main: '#e09831', sub: '#edc68d', rgb: '224, 152, 49', avatar: "https://origin.picgo.net/2026/10/28/13bf9ae73a3be135a6c944e27b2a789726459aeba670db89.png", big: true, rose: true },
    { chars: ["艾丽丝"], main: '#bc2c21', sub: '#da8a84', rgb: '188, 44, 33', avatar: "https://origin.picgo.net/2026/10/28/aceff91b1f4b833b2c75673bac151e529914b1c77136f386.png", big: true, rose: true },
    { chars: ["艾丽丝菲兹3世"], main: '#4674b2', sub: '#99b2d4', rgb: '70, 116, 178', avatar: "https://origin.picgo.net/2026/10/28/3c199adb5c6775871.png", big: true, rose: true },
    { chars: ["艾丽丝菲兹4世"], main: '#e028d0', sub: '#ed88e5', rgb: '224, 40, 208', avatar: "https://origin.picgo.net/2026/10/28/462461347bffc037c.png", big: true, rose: true },
    { chars: ["艾丽丝菲兹10世"], main: '#b22041', sub: '#d48496', rgb: '178, 32, 65', avatar: "https://origin.picgo.net/2026/10/28/1067663703b343dea0.png", big: true, rose: true },
    { chars: ["艾丽丝菲兹15世"], main: '#a220b2', sub: '#cb84d4', rgb: '162, 32, 178', avatar: "https://origin.picgo.net/2026/10/28/15263fd139c62b0e6e.png", big: true, rose: true },
    { chars: ["艾露贝提耶"], main: '#274dd8', sub: '#889de9', rgb: '39, 77, 216', avatar: "https://origin.picgo.net/2026/10/28/9247c2ca1b310ea64b3462611278e3e1670b87ed765fe026.png", big: true, rose: true },
    { chars: ["白兔"], main: '#603ce0', sub: '#a793ed', rgb: '96, 60, 224', avatar: "https://origin.picgo.net/2026/10/28/a272cac4dcb3960a5514d3816fb273460f682c944195e485.png", big: true, rose: true },
    { chars: ["法蒂玛"], main: '#b24420', sub: '#d49884', rgb: '178, 68, 32', avatar: "https://origin.picgo.net/2026/10/28/fb0b026fa22e1ebc8fd820f1d6a10f61d4d421260166ace8.png", big: true, rose: true },
    { chars: ["格诺西丝"], main: '#28e096', sub: '#88edc5', rgb: '40, 224, 150', avatar: "https://origin.picgo.net/2026/10/28/8d2a01d6076030b298901e60b63e2431e419f7757f5ffd97.png", big: true, rose: true },
    { chars: ["古兰贝莉娅"], main: '#e06864', sub: '#edaba9', rgb: '224, 104, 100', avatar: "https://origin.picgo.net/2026/10/28/cc72c9263d2d0af19196c2ba21e512bb4c2b24840248bb81.png", big: true, rose: true },
    { chars: ["黑之艾丽丝"], main: '#a7bd55', sub: '#cedaa1', rgb: '167, 189, 85', avatar: "https://origin.picgo.net/2026/10/28/3b280659f2d28286720c4c0a4258d8a38cd20d0cb5310a3c.png", big: true, rose: true },
    { chars: ["机械降神"], main: '#90da27', sub: '#c1ea88', rgb: '144, 218, 39', avatar: "https://origin.picgo.net/2026/10/28/539dfa775875de0592a6e105ca6154484bb5ad7a8ee28a9b.png", big: true, rose: true },
    { chars: ["卡桑德拉"], main: '#b23768', sub: '#d491ab', rgb: '178, 55, 104', avatar: "https://origin.picgo.net/2026/10/28/d385822f69f5ac405f4acbe0d0a1052f95d720063f1b17d9.png", big: true, rose: true },
    { chars: ["克莱奥・阿德拉"], main: '#cd8925', sub: '#e3be87', rgb: '205, 137, 37', avatar: "https://origin.picgo.net/2026/10/28/9ca7ab3417e113e5486a39e07b2670e571181f50f9d68eec.png", big: true, rose: true },
    { chars: ["拉斐艾拉"], main: '#e0ce28', sub: '#ede488', rgb: '224, 206, 40', avatar: "https://origin.picgo.net/2026/10/28/a4f749b3a9c50c01f02e2f0363458d58f96f7255f17ea2e2.png", big: true, rose: true },
    { chars: ["莉莉丝"], main: '#c264e0', sub: '#dda9ed', rgb: '194, 100, 224', avatar: "https://origin.picgo.net/2026/10/28/1918632b4fb1ed5c299e26aea514b407c025e13a4006d468.png", big: true, rose: true },
    { chars: ["鲁卡"], main: '#b26a50', sub: '#d4ad9e', rgb: '178, 106, 80', avatar: "https://origin.picgo.net/2026/10/28/0b52a3250d716905651aec5f7b1eeee5f2bd76fc6c64aecb.png", big: true, rose: true },
    { chars: ["路西菲娜"], main: '#b37850', sub: '#d5b49e', rgb: '179, 120, 80', avatar: "https://origin.picgo.net/2026/10/28/08c9d6b71412f08607f8e3455ba6a6912cbf44b69eea3ed2.png", big: true, rose: true },
    { chars: ["马鲁塞勒斯"], main: '#b2502f', sub: '#d49e8c', rgb: '178, 80, 47', avatar: "https://origin.picgo.net/2026/10/28/b4ebd53577168ba3dc2094e8f854aa11c8861aa77b31833f.png", big: true, rose: true },
    { chars: ["梅菲斯特"], main: '#b29a47', sub: '#d4c799', rgb: '178, 154, 71', avatar: "https://origin.picgo.net/2026/10/28/1fb1be59345533d72fc9c9bdb12ab62cda7d39c6294614a5.png", big: true, rose: true },
    { chars: ["米迦艾拉"], main: '#e08664', sub: '#edbca9', rgb: '224, 134, 100', avatar: "https://origin.picgo.net/2026/10/28/36b42c1cf906cade274f12979dd489b2822f29b12808c4c6.png", big: true, rose: true },
    { chars: ["摩莉甘"], main: '#3aa4ca', sub: '#92cce1', rgb: '58, 164, 202', avatar: "https://origin.picgo.net/2026/10/28/ab4396e009821f188991edbfb62bf3f75aa6173f2431847b.png", big: true, rose: true },
    { chars: ["尼菲特・泰罗斯"], main: '#b22120', sub: '#d48484', rgb: '178, 33, 32', avatar: "https://origin.picgo.net/2026/10/28/cf0ffbed524b16b8328e47c6a19aedf16a406835403a5c29.png", big: true, rose: true },
    { chars: ["努尔・科吉托"], main: '#4423c3', sub: '#9886de', rgb: '68, 35, 195', avatar: "https://origin.picgo.net/2026/10/28/992d055dbe6826b1a79da60d8464c78e56e15a2f512c7a7f.png", big: true, rose: true },
    { chars: ["诺姆"], main: '#d49730', sub: '#e7c58d', rgb: '212, 151, 48', avatar: "https://origin.picgo.net/2026/10/28/10c978a7a99babfdacc6d483d816de85693e21e4298fb3c7.png", big: true, rose: true },
    { chars: ["胖次老师"], main: '#b25d50', sub: '#d4a59e', rgb: '178, 93, 80', avatar: "https://origin.picgo.net/2026/10/28/da2f74e834e2d77bebc880026bfc5a130605a19f37c4269f.png", big: true, rose: true },
    { chars: ["普罗米斯汀"], main: '#b22244', sub: '#d48598', rgb: '178, 34, 68', avatar: "https://origin.picgo.net/2026/10/28/552fb944682eaa23dd0870f528edde5f1aac3fa97b55abc2.png", big: true, rose: true },
    { chars: ["萨拉曼达"], main: '#e05241', sub: '#ed9f96', rgb: '224, 82, 65', avatar: "https://origin.picgo.net/2026/10/28/206eaebab2e47531a0653ee906cf130b714f30e96dde3bf8.png", big: true, rose: true },
    { chars: ["沙蛇"], main: '#b27a4f', sub: '#d4b59e', rgb: '178, 122, 79', avatar: "https://origin.picgo.net/2026/10/28/d910a0d1ada0cb4b3c0f406241692752de4d6c4851bc56f8.png", big: true, rose: true },
    { chars: ["圣·伊莉娅王"], main: '#b5772a', sub: '#d6b489', rgb: '181, 119, 42', avatar: "https://origin.picgo.net/2026/10/28/105ed942c86bc5206465cee84fbf7d8623d675075bccd031.png", big: true, rose: true },
    { chars: ["死神"], main: '#d12531', sub: '#e5878d', rgb: '209, 37, 49', avatar: "https://origin.picgo.net/2026/10/28/0f938348c2b75f870e4d03b31b0e551b3bf9ef41649f65ee.png", big: true, rose: true },
    { chars: ["索尼娅"], main: '#ce7b47', sub: '#e4b699', rgb: '206, 123, 71', avatar: "https://origin.picgo.net/2026/10/28/dee9c2b8fc26965107455c8065432ef7dd9ff17579aefbff.png", big: true, rose: true },
    { chars: ["温蒂妮"], main: '#6484e0', sub: '#a9bbed', rgb: '100, 132, 224', avatar: "https://origin.picgo.net/2026/10/28/1565b0a237fc71a9621b875e3e2a742ccda6e627f4d5a929.png", big: true, rose: true },
    { chars: ["希尔芙"], main: '#b77a20', sub: '#d7b584', rgb: '183, 122, 32', avatar: "https://origin.picgo.net/2026/10/28/03e3b63134b4a4e1b3730edeeac621dc061403608c646af6.png", big: true, rose: true },
    { chars: ["锡安"], main: '#b22040', sub: '#d48495', rgb: '178, 32, 64', avatar: "https://origin.picgo.net/2026/10/28/beb7474a94211f6a55807409d2b3f7857f7ddab5b24c5be6.png", big: true, rose: true },
    { chars: ["伊迪亚・鲁卡斯"], main: '#7950b2', sub: '#b59ed4', rgb: '121, 80, 178', avatar: "https://origin.picgo.net/2026/10/28/6addc5b6c9a08aa664c5c68272253650363040bc69280cfc.png", big: true, rose: true },
    { chars: ["伊甸"], main: '#2973b2', sub: '#89b2d4', rgb: '41, 115, 178', avatar: "https://origin.picgo.net/2026/10/28/66585346903fbe70bedcef9a540a91f26c066a9e4d163b8b.png", big: true, rose: true },
    { chars: ["伊莉娅丝"], main: '#e09a64', sub: '#edc7a9', rgb: '224, 154, 100', avatar: "https://origin.picgo.net/2026/10/28/0f80956432e00c1f5b90eaf5fc41618745b391dae780ae5c.png", big: true, rose: true },
    { chars: ["影䌷"], main: '#b2404d', sub: '#d4959d', rgb: '178, 64, 77', avatar: "https://origin.picgo.net/2026/10/28/d88900a3832ef3714c9580c06195c268a5bdab265db03805.png", big: true, rose: true },
    { chars: ["宇宙神蝶"], main: '#b2506b', sub: '#d49ead', rgb: '178, 80, 107', avatar: "https://origin.picgo.net/2026/10/28/7d5807caaa5f814154d0b3b1426145150b7479bec43c19f6.png", big: true, rose: true },
    { chars: ["玉藻"], main: '#e08546', sub: '#edbb99', rgb: '224, 133, 70', avatar: "https://origin.picgo.net/2026/10/28/3c9c1f31d592118d24af1214034ea3223811424807a1fe63.png", big: true, rose: true },
    { chars: ["尼克丝"], main: '#b23455', sub: '#d48fa1', rgb: '178, 52, 85', avatar: "https://origin.picgo.net/2026/10/28/bd17b1ae7e1dfac4df5e3487d97d037f662b090e963a6058.png", big: true, rose: true },
    { chars: ["莉莉雅"], main: '#5055b2', sub: '#9ea1d4', rgb: '80, 85, 178', avatar: "https://origin.picgo.net/2026/10/28/16612d06d84884177efc2fb810cb7c7a4451962e0aacf3e0.png", big: true, rose: true },
    { chars: ["克拉尔"], main: '#e08864', sub: '#edbda9', rgb: '224, 136, 100', avatar: "https://origin.picgo.net/2026/10/28/731e84c1ae0bc4e3fceeddd03dbdfde54624fc666aacca86.png", big: true, rose: true },
    { chars: ["蕾库"], main: '#b28e20', sub: '#d4c084', rgb: '178, 142, 32', avatar: "https://origin.picgo.net/2026/10/28/1d0d60fc895202b52f63cd79542ade944c2fe9d1f517e0d6.png", big: true, rose: true },
    { chars: ["玛莉亚"], main: '#c95ab2', sub: '#e1a4d4', rgb: '201, 90, 178', avatar: "https://origin.picgo.net/2026/10/28/6d6238b29c15549814a4c74aff03bf352c62a36ebf477e71.png", big: true, rose: true },
    { chars: ["纳兹娜"], main: '#b22020', sub: '#d48484', rgb: '178, 32, 32', avatar: "https://origin.picgo.net/2026/10/28/6f1cfd144adf2478f3330830191e76a413e2aa7dff31a23b.png", big: true, rose: true },
    { chars: ["皮丽拉"], main: '#dcbb5c', sub: '#ebd9a5', rgb: '220, 187, 92', avatar: "https://origin.picgo.net/2026/10/28/6fe78d1496335ec5ce0bf16a35783d82f8f298d707ffeda5.png", big: true, rose: true },
    { chars: ["茜拉"], main: '#e0c064', sub: '#eddca9', rgb: '224, 192, 100', avatar: "https://origin.picgo.net/2026/10/28/20693e8d16927f684edc19b97e722a97c904e951f6235801.png", big: true, rose: true },
    { chars: ["缇蕾玛"], main: '#b25950', sub: '#d4a39e', rgb: '178, 89, 80', avatar: "https://origin.picgo.net/2026/10/28/656bce982972aa977bbdfba3378b2be37a6e971c08c34eea.png", big: true, rose: true },
    { chars: ["乌菈"], main: '#4ab29d', sub: '#9bd4c9', rgb: '74, 178, 157', avatar: "https://origin.picgo.net/2026/10/28/fe54d7b05091d8d650e22bca1bbe0c4c09e71664fda412c1.png", big: true, rose: true },
    { chars: ["雪娜"], main: '#40a8b2', sub: '#95cfd4', rgb: '64, 168, 178', avatar: "https://origin.picgo.net/2026/10/28/486c7f83edfec0b880f865d89e6bc504fe363750167626c4.png", big: true, rose: true },
    { chars: ["艾梅拉"], main: '#d34047', sub: '#e69599', rgb: '211, 64, 71', avatar: "https://origin.picgo.net/2026/10/28/71462022d0583ce763cd5c6d256f4f4e4d4cb96593ad4c6e.png", big: true, rose: true },
    { chars: ["凯米迦"], main: '#9950b3', sub: '#c69ed5', rgb: '153, 80, 179', avatar: "https://origin.picgo.net/2026/10/28/10cfb9caff273075df6d535393f4a5bac27315ec3b124171.png", big: true, rose: true },
    { chars: ["库卢哈"], main: '#b25b20', sub: '#d4a484', rgb: '178, 91, 32', avatar: "https://origin.picgo.net/2026/10/28/1519a7080462f341275f4e64476fa0ef057cc400d76fed45.png", big: true, rose: true },
    { chars: ["拉比"], main: '#e02855', sub: '#ed88a1', rgb: '224, 40, 85', avatar: "https://origin.picgo.net/2026/10/28/24ea1cc0321954ef979e0799f1bf446d3828a4a69fc00bbe.png", big: true, rose: true },
    { chars: ["蕾斯缇亚"], main: '#b2554c', sub: '#d4a19c', rgb: '178, 85, 76', avatar: "https://origin.picgo.net/2026/10/28/d775fe464b0f674bc549f0792117e3820d9f6599eb18de3e.png", big: true, rose: true },
    { chars: ["欧里丝"], main: '#63b7dd', sub: '#a9d7ec', rgb: '99, 183, 221', avatar: "https://origin.picgo.net/2026/10/28/940cd961d36816a28988f052a893f18d082284ec0bcb1b17.png", big: true, rose: true },
    { chars: ["奥莉维亚"], main: '#285fb2', sub: '#88a7d4', rgb: '40, 95, 178', avatar: "https://origin.picgo.net/2026/10/28/d7f711ef4b7efe68e8e2e62eed319ff7d5e3e84bc8fb6411.png", big: true, rose: true },
    { chars: ["蒂塔"], main: '#b2204e', sub: '#d4849d', rgb: '178, 32, 78', avatar: "https://origin.picgo.net/2026/10/28/9b23302ba30f7456c4e60dd958fe9ad866c8b6b216ad5513.png", big: true, rose: true },
    { chars: ["法莉亚"], main: '#b25054', sub: '#d49ea0', rgb: '178, 80, 84', avatar: "https://origin.picgo.net/2026/10/28/f6fd0e1a80ebea54a471da5eedeb8a657a71e4aaf72165f1.png", big: true, rose: true },
    { chars: ["库"], main: '#3fbcbe', sub: '#95dadb', rgb: '63, 188, 190', avatar: "https://origin.picgo.net/2026/10/28/df3b2e2655f6162522bf6b5d76fc43b563c89d1a8d93f0aa.png", big: true, rose: true },
    { chars: ["蕾达"], main: '#c82450', sub: '#e0869e', rgb: '200, 36, 80', avatar: "https://origin.picgo.net/2026/10/28/68c366e8a42922d7e61b21a813de077d0d8f3dc19938abf1.png", big: true, rose: true },
    { chars: ["露西卡"], main: '#b25332', sub: '#d4a08e', rgb: '178, 83, 50', avatar: "https://origin.picgo.net/2026/10/28/1fc7a0ff3a1f0fb7038418f8a0f0b4d979730afd7072f6eb.png", big: true, rose: true },
    { chars: ["玛尼蒂"], main: '#cb4e3a', sub: '#e29d92', rgb: '203, 78, 58', avatar: "https://origin.picgo.net/2026/10/28/a68f5d650ce6f0b5f8dddcd440d24f4e1c78cb039ae1b118.png", big: true, rose: true },
    { chars: ["维娜"], main: '#e0aa64', sub: '#edd0a9', rgb: '224, 170, 100', avatar: "https://origin.picgo.net/2026/10/28/0a0cee35d1cd90b760de343e42d03c7eaadb8058fc5dd843.png", big: true, rose: true },
    { chars: ["尤贝尔"], main: '#e0d264', sub: '#ede6a9', rgb: '224, 210, 100', avatar: "https://origin.picgo.net/2026/10/28/b2f5c878a848d79259d0279b796d8aaebc6b67e640b43ae8.png", big: true, rose: true },
    { chars: ["约尔娜娅"], main: '#b25139', sub: '#d49f92', rgb: '178, 81, 57', avatar: "https://origin.picgo.net/2026/10/28/5be4dc32ac077e02fcdccda655fda1f69708a7aeda2a13cf.png", big: true, rose: true },
    { chars: ["优依"], main: '#5369ba', sub: '#a0acd9', rgb: '83, 105, 186', avatar: "https://origin.picgo.net/2026/10/28/d1fcd8eee4c3af3db8a6ef945424f34c4e16d58e56672b17.png", big: true, rose: true },
    { chars: ["內伊"], main: '#b85e36', sub: '#d7a690', rgb: '184, 94, 54', avatar: "https://origin.picgo.net/2026/10/28/18d3ad3b3f49607e42977621b2a15b10d6d830c14b090dd7.png", big: true, rose: true },
    { chars: ["加兰哈德"], main: '#b2202f', sub: '#d4848c', rgb: '178, 32, 47', avatar: "https://origin.picgo.net/2026/10/28/34c83b8bf6c74dc4b03fdbe8652d180153d068f771ce38d6.png", big: true, rose: true },
    { chars: ["尤克夏"], main: '#c42360', sub: '#de86a7', rgb: '196, 35, 96', avatar: "https://origin.picgo.net/2026/10/28/6a3b79169e8ba2cd5ec39339590b58aa35bf0fbf0504eb85.png", big: true, rose: true },
    { chars: ["希利乌斯"], main: '#b25067', sub: '#d49eab', rgb: '178, 80, 103', avatar: "https://origin.picgo.net/2026/10/28/71186294717dbeabcf0bd582c2a3cf2bb81be96615db3a4f.png", big: true, rose: true },
    { chars: ["戴安娜"], main: '#6650b2', sub: '#aa9ed4', rgb: '102, 80, 178', avatar: "https://origin.picgo.net/2026/10/28/c952293e0c4a4d1931ed24a2fe518d5ff6b0f0ed581b52e5.png", big: true, rose: true },
    { chars: ["琪琪露"], main: '#e0b12e', sub: '#edd48c', rgb: '224, 177, 46', avatar: "https://origin.picgo.net/2026/10/28/edeb723a27713cd0fb224633f9fe53260a5bd46ed16e0a74.png", big: true, rose: true },
    { chars: ["米娜"], main: '#266dd7', sub: '#87aee9', rgb: '38, 109, 215', avatar: "https://origin.picgo.net/2026/10/28/0b33f03f03805b13790a1dfbc8889f5b74073e14e49cbf60.png", big: true, rose: true },
    { chars: ["莉莉"], main: '#dfa657', sub: '#edcea2', rgb: '223, 166, 87', avatar: "https://origin.picgo.net/2026/10/28/81d57dfab57509d20b3fbf236b24de3b16064c90a62c3dc5.png", big: true, rose: true },
    { chars: ["菲玖"], main: '#9de064', sub: '#c9eda9', rgb: '157, 224, 100', avatar: "https://origin.picgo.net/2026/10/28/500169bb6908d3e6fe5a098a9aa5c7452d54a69cb07d4768.png", big: true, rose: true },
    { chars: ["贞德"], main: '#c38840', sub: '#debd95', rgb: '195, 136, 64', avatar: "https://origin.picgo.net/2026/10/28/40c3ac737627dd576bb68b79ed77564e6a2c63c4b5f353f6.png", big: true, rose: true },
    { chars: ["雷格鲁斯"], main: '#b25b50', sub: '#d4a49e', rgb: '178, 91, 80', avatar: "https://origin.picgo.net/2026/10/28/331db4917cafa5bba69aff78e5958f0df4488b4ceca5f36b.png", big: true, rose: true },
    { chars: ["卡朵莲"], main: '#d9d9e4', sub: '#f2f2f8', rgb: '217, 217, 228', avatar: "https://origin.picgo.net/2026/10/28/569ce08721e501dafd728806464962989c44f2acb4425f50.png", big: true, rose: true },
    { chars: ["阿拉蒂娅"], main: '#8a5ac0', sub: '#c2a2e0', rgb: '138,90,192', avatar: "https://origin.picgo.net/2026/10/28/31eb422a9769d6fff2dfe0a31e97a9345c1bb919f25d707b.png", big: true, rose: true },
    { chars: ["戴亚"], main: '#b73167', sub: '#d78dab', rgb: '183, 49, 103', avatar: "https://origin.picgo.net/2026/10/28/62ac61b30767c87b3b6966f7024b7f4a522076eb571b8552.png", big: true, rose: true }
  ];

  /* 由 NEW_CHARACTERS 生成 CSS。放在基础 CSS 之后，同优先级下后者胜，
     所以新角色的配色/头像能盖过「普通NPC暗夜微光」那条默认规则。

     ⚠️ 但「放在后面」压不住「西幻译名首字色池」：
     色池写的是 `div.custom-nvn-dialogue:is([data-char^="欧"], …):not([data-char*="艾拉"]):not(…)…`，
     每个 :not([属性]) 都算一个属性选择器 → 权重 (0,7,1)；而生成的选择器只有 (0,3,1)。
     两边都是 !important 时，权重高的赢，于是「欧里丝」「艾丽丝」这种首字撞上色池的角色，
     名牌/头像框/引号/动作描写会变成色池里的莫兰迪色，而不是 NEW_CHARACTERS 里写的色。
     （典型症状：欧里丝的头像框发灰、引号发灰，而贞德、盖欧正常。）

     修法：给生成的选择器尾巴加一个恒为真的 :not(#id)（页面里没有这个 id），
     等于白送 1 个 ID 权重 (1,3,1)，压过任何由属性选择器堆出来的权重。 */
  function buildNewCharacterCss() {
    if (!NEW_CHARACTERS.length) return '';
    const B = '.mes_text div.custom-nvn-dialogue:is(';
    const BOOST = '):not(#nvn-char-color-override)';
    let out = '\n\n/* ================= 新增角色（由 NEW_CHARACTERS 自动生成） ================= */\n';
    for (const c of NEW_CHARACTERS) {
      if (!c || !Array.isArray(c.chars) || !c.chars.length) continue;
      const sel = c.chars.map(function (n) { return '[data-char="' + n + '"], [data-char^="' + n + '·"]'; }).join(', ');
      const head = B + sel + BOOST;
      out += '\n/* ' + c.chars.join(' / ') + ' */\n';
      out += head + ' {\n'
           + '  --main: ' + (c.main || '#8896a5') + ' !important;\n'
           + '  --sub: ' + (c.sub || '#b2becb') + ' !important;\n'
           + '  --rgb: ' + (c.rgb || '136, 150, 165') + ' !important;\n'
           + '  --motion-color: ' + (c.motion || c.main || '#a8b5c2') + ' !important;\n'
           + '}\n';
      if (c.avatar) {
        out += head + ' .custom-nvn-avatar-img {\n'
             + '  background-image: url("' + c.avatar + '") !important;\n'
             + (c.big ? '  cursor: pointer !important;\n' : '')
             + '}\n';
        /* 有立绘的角色不要 NPC 那圈 4px 内嵌细框（基础 CSS 用
           `:not(:is(旧名单)) .custom-nvn-avatar-img::after` 加的；新角色不在那份旧名单里，
           就会被套上 → 看上去像「图没填满 + 里面多了一圈细框」）。 */
        out += head + ' .custom-nvn-avatar-img::after { display: none !important; }\n';
      } else if (c.big) {
        out += head + ' .custom-nvn-avatar-img { cursor: pointer !important; }\n';
      }
      out += head + '::before, ' + head + '::after { display: none !important; }\n';
      if (c.portrait) {
        out += head + ' .custom-nvn-portrait-full {\n  content: url("' + c.portrait + '") !important;\n}\n';
      }
      if (c.big) {
        out += head + ' .custom-nvn-avatar-fallback-box { display: none !important; }\n';
      }
      if (c.rose) {
        out += head + ' .custom-nvn-rose-crest {\n'
             + '  display: flex !important;\n  align-items: center;\n  justify-content: center;\n'
             + '  width: 20px;\n  height: 20px;\n  color: var(--main);\n'
             + '  filter: drop-shadow(0 0 4px rgba(var(--rgb), 0.6));\n  flex-shrink: 0;\n}\n';
      }
    }
    return out;
  }

  /* ---------------------------------------------------------------
   * 两份主题样式（由酒馆自己的 decodeStyleTags() 生成，选择器形如
   * .mes_text .custom-nvn-dialogue；属性选择器保持原样，酒馆只改 class）。
   * light 同时覆盖「中文」和「中日双语」；dark 是深色框那套。
   * 每条选择器都带 .mes_text 前缀 → 只作用在消息正文，不会外溢。
   * --------------------------------------------------------------- */
  const CSS = {
    light: `
/* ====== 消除原生气泡样式 ====== */
.mes_text:has(.custom-nvn-dialogue) blockquote,.mes_text:has(.custom-nvn-dialogue) > p:has(> .custom-nvn-dialogue),
.custom-nvn-dialogue {
  background: transparent !important;
  border: 0 !important;
  box-shadow: none !important;
}

/* ====== 基础容器 ====== */
.custom-nvn-dialogue {
  --main: #8896a5;
  --sub: #b2becb;
  --rgb: 136, 150, 165;
  --motion-color: #a8b5c2;
  --stage-text: #eee7dc;
  
  display: flex;
  align-items: flex-start;
  align-self: flex-start;
  gap: 16px;
  width: 100%;
  max-width: 100%;
  margin: 14px 0 16px;
  padding: 0;
  color: var(--stage-text);
  font-family: "Noto Serif SC", "Source Han Serif SC", "PingFang SC", "Microsoft YaHei", serif;
  clear: both;
}

.custom-nvn-dialogue * { box-sizing: border-box; }

/* ====== 头像视窗（100px × 125px） ====== */
.custom-nvn-avatar-side {
  width: 100px;
  height: 125px !important;
  min-height: 125px !important;
  flex: 0 0 100px;
  position: relative;
}

.custom-nvn-avatar-popover {
  display: block !important;
  width: 100%;
  height: 100%;
  margin: 0;
  padding: 0;
}

.custom-nvn-avatar-popover summary {
  list-style: none !important;
  outline: none !important;
  display: block !important;
  width: 100%;
  height: 100%;
}
.custom-nvn-avatar-popover summary::-webkit-details-marker,
.custom-nvn-avatar-popover summary::marker {
  display: none !important;
}

.custom-nvn-avatar-img {
  width: 100px;
  height: 125px !important;
  min-height: 125px !important;
  border: 1.5px solid rgba(var(--rgb), 0.45);
  border-radius: 14px;
  background-color: transparent !important;
  background-position: center 10%;
  background-repeat: no-repeat;
  background-size: cover;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
  box-shadow: 0 5px 18px rgba(0, 0, 0, 0.45), inset 0 0 14px rgba(var(--rgb), 0.12);
}

/* 仅对非立绘普通NPC启用暗夜微光背景与双层微饰线 */
div.custom-nvn-dialogue:not(:is(
  [data-char*="克蕾雅"], [data-char*="卢克蕾齐雅"], [data-char*="莉莉娅"], [data-char*="莉莉娅"],
  [data-char*="梅拉"], [data-char*="梅拉妮"], [data-char*="艾拉"], [data-char*="拉姆"], 
  [data-char*="拉姆内"], [data-char*="阿黛拉"], [data-char*="伊莉丝"], [data-char*="丽塔"], 
  [data-char*="菲娅"], [data-char*="菲娅娜"], [data-char*="大魔女"], [data-char*="露娜"], 
  [data-char*="桑尼"], [data-char*="萨菲亚"], [data-char*="凯埃尔"], [data-char*="卡伊埃尔"],
  [data-char*="夏洛特"], [data-char*="法妮雅"], [data-char*="响木天音"], [data-char*="芙洛蒂"],
  [data-char*="艾妮希雅"], [data-char*="凯拉涅斯"], [data-char*="拉菲莉娅"], [data-char*="赛蕾姆丝"],
  [data-char*="小忆"], [data-char*="斯雅"], [data-char*="盖欧露易丝"], [data-char*="露易丝"], 
  [data-char*="斯提亚拉"], [data-char*="提亚拉"], [data-char*="古伊奈"], [data-char*="雷克西斯"], 
  [data-char*="帕特里琪娅"], [data-char*="奇诺米"], [data-char*="蒂莎"], [data-char*="加莉泰娅"],
  [data-char*="小春"], [data-char*="五月雨"], [data-char*="大王"],
  [data-char*="艾尔希"], [data-char*="狄娜"], [data-char*="卡莲"], [data-char*="柯萝特"],
  [data-char*="芙萝"], [data-char*="艾珀尔"], [data-char*="芙洛瑞丝"], [data-char*="布娜"],
  [data-char*="幽妮娅"], [data-char*="塞伊"], [data-char*="利奥"],
  [data-char*="托莉娜"], [data-char*="一之濑雫"], [data-char*="爱丽丝"], [data-char*="诺登"], [data-char*="小红帽"], [data-char*="普利凯特"],
  [data-char*="梅贝尔"], [data-char*="玛丽·安"], [data-char*="莉耶芙"], [data-char*="公爵夫人"],
  [data-char*="帽子屋"], [data-char*="三月兔"], [data-char*="格里菲"], [data-char*="假海龟"],
  [data-char*="渡渡"], [data-char*="希夏"], [data-char*="比尔"], [data-char*="维多利雅"],
  [data-char*="弗洛伦斯"], [data-char*="罗丽娜"], [data-char*="格尔达"], [data-char*="尤妮丝"],
  [data-char*="莱登"], [data-char*="克缇"], [data-char*="贾巴沃克"], [data-char*="贾布加布"],
  [data-char*="班达斯奈奇"], [data-char*="希伏契"], [data-char*="柴郡猫"], [data-char*="人偶爱丽丝"],
  [data-char*="崔德尔"], [data-char*="雏鸟"], [data-char*="蛇神"], [data-char*="诺艾儿"], [data-char*="诺艾尔"], [data-char*="诺艾儿·柯涅尔"], [data-char*="诺艾尔·柯涅尔"], [data-char*="诺艾尔·私"], [data-char*="诺艾儿·私"], [data-char*="爱莉丝"], [data-char*="摇篮的爱莉丝"], [data-char*="丽薇歌塔"], [data-char*="丽薇歌塔·柯涅尔"], [data-char*="伊夏"], [data-char*="伊夏·波利斯塔切尔"], [data-char*="普莉姆拉"], [data-char*="蒂格蕾娜"], [data-char*="蒂格蕾娜·索菈"], [data-char*="阿尔玛"], [data-char*="阿尔玛·奥普菲帕姆"], [data-char*="提尔德"], [data-char*="提尔德·柯涅尔"], [data-char*="德尔菲尼"], [data-char*="德尔菲尼·柯涅尔"], [data-char*="梅法"], [data-char*="梅法·格里亚德"], [data-char*="南丁格尔"]
, [data-char*="女儿"], [data-char*="爱·丽·丝"], [data-char*="IV"], [data-char*="驱魔"], [data-char*="魔化"])) .custom-nvn-avatar-img {
  background-image: radial-gradient(ellipse at center, rgba(var(--rgb), 0.16) 0%, rgba(14, 16, 20, 0.92) 100%) !important;
}

div.custom-nvn-dialogue:not(:is(
  [data-char*="克蕾雅"], [data-char*="卢克蕾齐雅"], [data-char*="莉莉娅"], [data-char*="莉莉娅"],
  [data-char*="梅拉"], [data-char*="梅拉妮"], [data-char*="艾拉"], [data-char*="拉姆"], 
  [data-char*="拉姆内"], [data-char*="阿黛拉"], [data-char*="伊莉丝"], [data-char*="丽塔"], 
  [data-char*="菲娅"], [data-char*="菲娅娜"], [data-char*="大魔女"], [data-char*="露娜"], 
  [data-char*="桑尼"], [data-char*="萨菲亚"], [data-char*="凯埃尔"], [data-char*="卡伊埃尔"],
  [data-char*="夏洛特"], [data-char*="法妮雅"], [data-char*="响木天音"], [data-char*="芙洛蒂"],
  [data-char*="艾妮希雅"], [data-char*="凯拉涅斯"], [data-char*="拉菲莉娅"], [data-char*="赛蕾姆丝"],
  [data-char*="小忆"], [data-char*="斯雅"], [data-char*="盖欧露易丝"], [data-char*="露易丝"], 
  [data-char*="斯提亚拉"], [data-char*="提亚拉"], [data-char*="古伊奈"], [data-char*="雷克西斯"], 
  [data-char*="帕特里琪娅"], [data-char*="奇诺米"], [data-char*="蒂莎"], [data-char*="加莉泰娅"],
  [data-char*="小春"], [data-char*="五月雨"], [data-char*="大王"],
  [data-char*="艾尔希"], [data-char*="狄娜"], [data-char*="卡莲"], [data-char*="柯萝特"],
  [data-char*="芙萝"], [data-char*="艾珀尔"], [data-char*="芙洛瑞丝"], [data-char*="布娜"],
  [data-char*="幽妮娅"], [data-char*="塞伊"], [data-char*="利奥"],
  [data-char*="托莉娜"], [data-char*="一之濑雫"], [data-char*="爱丽丝"], [data-char*="诺登"], [data-char*="小红帽"], [data-char*="普利凯特"],
  [data-char*="梅贝尔"], [data-char*="玛丽·安"], [data-char*="莉耶芙"], [data-char*="公爵夫人"],
  [data-char*="帽子屋"], [data-char*="三月兔"], [data-char*="格里菲"], [data-char*="假海龟"],
  [data-char*="渡渡"], [data-char*="希夏"], [data-char*="比尔"], [data-char*="维多利雅"],
  [data-char*="弗洛伦斯"], [data-char*="罗丽娜"], [data-char*="格尔达"], [data-char*="尤妮丝"],
  [data-char*="莱登"], [data-char*="克缇"], [data-char*="贾巴沃克"], [data-char*="贾布加布"],
  [data-char*="班达斯奈奇"], [data-char*="希伏契"], [data-char*="柴郡猫"], [data-char*="人偶爱丽丝"],
  [data-char*="崔德尔"], [data-char*="雏鸟"], [data-char*="蛇神"], [data-char*="诺艾儿"], [data-char*="诺艾尔"], [data-char*="诺艾儿·柯涅尔"], [data-char*="诺艾尔·柯涅尔"], [data-char*="诺艾尔·私"], [data-char*="诺艾儿·私"], [data-char*="爱莉丝"], [data-char*="摇篮的爱莉丝"], [data-char*="丽薇歌塔"], [data-char*="丽薇歌塔·柯涅尔"], [data-char*="伊夏"], [data-char*="伊夏·波利斯塔切尔"], [data-char*="普莉姆拉"], [data-char*="蒂格蕾娜"], [data-char*="蒂格蕾娜·索菈"], [data-char*="阿尔玛"], [data-char*="阿尔玛·奥普菲帕姆"], [data-char*="提尔德"], [data-char*="提尔德·柯涅尔"], [data-char*="德尔菲尼"], [data-char*="德尔菲尼·柯涅尔"], [data-char*="梅法"], [data-char*="梅法·格里亚德"], [data-char*="南丁格尔"]
)) .custom-nvn-avatar-img::after {
  content: "";
  position: absolute;
  inset: 4px;
  border: 1px solid rgba(var(--rgb), 0.22);
  border-radius: 10px;
  pointer-events: none;
}

/* 有大立绘的角色开启手型指针 */
div.custom-nvn-dialogue:is(
  [data-char*="艾拉"], [data-char*="克蕾雅"], [data-char*="卢克蕾齐雅"], 
  [data-char*="莉莉娅"], [data-char*="拉姆"], [data-char*="梅拉"], 
  [data-char*="阿黛拉"], [data-char*="伊莉丝"], [data-char*="丽塔"], 
  [data-char*="露娜"], [data-char*="菲娅"],
  [data-char*="夏洛特"], [data-char*="法妮雅"], [data-char*="响木天音"], [data-char*="芙洛蒂"],
  [data-char*="艾妮希雅"], [data-char*="凯拉涅斯"], [data-char*="赛蕾姆丝"], [data-char*="小忆"],
  [data-char*="斯雅"], [data-char*="盖欧露易丝"], [data-char*="露易丝"], [data-char*="斯提亚拉"], 
  [data-char*="提亚拉"], [data-char*="古伊奈"], [data-char*="雷克西斯"], [data-char*="帕特里琪娅"], 
  [data-char*="奇诺米"], [data-char*="蒂莎"], [data-char*="加莉泰娅"],
  [data-char*="艾尔希"], [data-char*="狄娜"], [data-char*="卡莲"], [data-char*="柯萝特"], [data-char*="幽妮娅"],
  [data-char*="托莉娜"], [data-char*="一之濑雫"], [data-char*="IV"], [data-char*="丽薇歌塔"], [data-char*="丽薇歌塔·柯涅尔"], [data-char*="伊夏"], [data-char*="伊夏·波利斯塔切尔"], [data-char*="拉姆内"], [data-char*="摇篮的爱莉丝"], [data-char*="普莉姆拉"], [data-char*="梅拉妮"], [data-char*="爱·丽·丝"], [data-char*="爱丽丝"], [data-char*="爱莉丝"], [data-char*="王铠"], [data-char*="王铠古伊奈"], [data-char*="王铠盖欧露易丝"], [data-char*="艾尔希IV"], [data-char*="菲娅娜"], [data-char*="诺艾儿"], [data-char*="诺艾儿·柯涅尔"], [data-char*="诺艾儿·私"], [data-char*="诺艾尔"], [data-char*="诺艾尔·柯涅尔"], [data-char*="诺艾尔·私"], [data-char*="阿尔玛"], [data-char*="阿尔玛·奥普菲帕姆"], [data-char*="驱魔"], [data-char*="驱魔夏洛特"], [data-char*="魔化"], [data-char*="魔化托莉娜"]
, [data-char*="三月兔"], [data-char*="五月雨"], [data-char*="人偶爱丽丝"], [data-char*="假海龟"], [data-char*="克缇"], [data-char*="公爵夫人"], [data-char*="凯埃尔"], [data-char*="利奥"], [data-char*="南丁格尔"], [data-char*="卡伊埃尔"], [data-char*="塞伊"], [data-char*="大王"], [data-char*="女儿"], [data-char*="女儿爱丽丝"], [data-char*="妈妈爱丽丝"], [data-char*="妹妹爱丽丝"], [data-char*="小春"], [data-char*="小红帽"], [data-char*="尤妮丝"], [data-char*="崔德尔·蒂"], [data-char*="崔德尔·达姆"], [data-char*="布娜"], [data-char*="希伏契"], [data-char*="希夏"], [data-char*="帽子屋"], [data-char*="弗洛伦斯"], [data-char*="德尔菲尼"], [data-char*="德尔菲尼·柯涅尔"], [data-char*="拉菲莉娅"], [data-char*="提尔德"], [data-char*="提尔德·柯涅尔"], [data-char*="普利凯特"], [data-char*="柴郡猫"], [data-char*="格尔达"], [data-char*="格里菲"], [data-char*="桑尼"], [data-char*="梅法"], [data-char*="梅法·格里亚德"], [data-char*="梅贝尔"], [data-char*="母亲爱丽丝"], [data-char*="比尔"], [data-char*="渡渡"], [data-char*="爱丽丝·利德尔"], [data-char*="玛丽·安"], [data-char*="班达斯奈奇"], [data-char*="维多利雅"], [data-char*="罗丽娜"], [data-char*="艾珀尔"], [data-char*="芙洛瑞丝"], [data-char*="芙萝"], [data-char*="莉耶芙"], [data-char*="莱登"], [data-char*="萨菲亚"], [data-char*="蒂格蕾娜"], [data-char*="蒂格蕾娜·索菈"], [data-char*="蛇神"], [data-char*="诺登"], [data-char*="贾巴沃克"], [data-char*="贾布加布"], [data-char*="雏鸟"]) .custom-nvn-avatar-img {
  cursor: pointer !important;
}

/* 无大立绘NPC禁用弹出交互 */
div.custom-nvn-dialogue:not(:is(
  [data-char*="艾拉"], [data-char*="克蕾雅"], [data-char*="卢克蕾齐雅"], 
  [data-char*="莉莉娅"], [data-char*="拉姆"], [data-char*="梅拉"], 
  [data-char*="阿黛拉"], [data-char*="伊莉丝"], [data-char*="丽塔"], 
  [data-char*="露娜"], [data-char*="菲娅"],
  [data-char*="夏洛特"], [data-char*="法妮雅"], [data-char*="响木天音"], [data-char*="芙洛蒂"],
  [data-char*="艾妮希雅"], [data-char*="凯拉涅斯"], [data-char*="赛蕾姆丝"], [data-char*="小忆"],
  [data-char*="斯雅"], [data-char*="盖欧露易丝"], [data-char*="露易丝"], [data-char*="斯提亚拉"], 
  [data-char*="提亚拉"], [data-char*="古伊奈"], [data-char*="雷克西斯"], [data-char*="帕特里琪娅"], 
  [data-char*="奇诺米"], [data-char*="蒂莎"], [data-char*="加莉泰娅"],
  [data-char*="艾尔希"], [data-char*="狄娜"], [data-char*="卡莲"], [data-char*="柯萝特"], [data-char*="幽妮娅"],
  [data-char*="托莉娜"], [data-char*="一之濑雫"], [data-char*="IV"], [data-char*="一之濑雫"], [data-char*="丽塔"], [data-char*="丽薇歌塔"], [data-char*="丽薇歌塔·柯涅尔"], [data-char*="伊夏"], [data-char*="伊夏·波利斯塔切尔"], [data-char*="伊莉丝"], [data-char*="克蕾雅"], [data-char*="凯拉涅斯"], [data-char*="加莉泰娅"], [data-char*="卡莲"], [data-char*="卢克蕾齐雅"], [data-char*="古伊奈"], [data-char*="夏洛特"], [data-char*="响木天音"], [data-char*="奇诺米"], [data-char*="小忆"], [data-char*="帕特里琪娅"], [data-char*="幽妮娅"], [data-char*="托莉娜"], [data-char*="拉姆"], [data-char*="拉姆内"], [data-char*="提亚拉"], [data-char*="摇篮的爱莉丝"], [data-char*="斯提亚拉"], [data-char*="斯雅"], [data-char*="普莉姆拉"], [data-char*="柯萝特"], [data-char*="梅拉"], [data-char*="梅拉妮"], [data-char*="法妮雅"], [data-char*="爱·丽·丝"], [data-char*="爱丽丝"], [data-char*="爱莉丝"], [data-char*="狄娜"], [data-char*="王铠"], [data-char*="王铠古伊奈"], [data-char*="王铠盖欧露易丝"], [data-char*="盖欧露易丝"], [data-char*="艾妮希雅"], [data-char*="艾尔希"], [data-char*="艾尔希IV"], [data-char*="艾拉"], [data-char*="芙洛蒂"], [data-char*="菲娅"], [data-char*="菲娅娜"], [data-char*="蒂莎"], [data-char*="诺艾儿"], [data-char*="诺艾儿·柯涅尔"], [data-char*="诺艾儿·私"], [data-char*="诺艾尔"], [data-char*="诺艾尔·柯涅尔"], [data-char*="诺艾尔·私"], [data-char*="赛蕾姆丝"], [data-char*="阿尔玛"], [data-char*="阿尔玛·奥普菲帕姆"], [data-char*="阿黛拉"], [data-char*="雷克西斯"], [data-char*="露娜"], [data-char*="露易丝"], [data-char*="驱魔"], [data-char*="驱魔夏洛特"], [data-char*="魔化"], [data-char*="魔化托莉娜"]
)) .custom-nvn-avatar-popover {
  pointer-events: none !important;
}

/* ====== NPC 竖框名字填充 ====== */
.custom-nvn-avatar-fallback-box {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 10px 6px;
  position: relative;
  z-index: 2;
}

.custom-nvn-avatar-fallback {
  display: block;
  width: 100%;
  max-width: 2.3em;
  margin: 0 auto;
  color: var(--main);
  font-size: 1.22em;
  font-weight: 700;
  line-height: 1.32;
  letter-spacing: 0.1em;
  text-align: center;
  word-break: break-all;
  text-shadow: 0 0 8px rgba(var(--rgb), 0.5), 0 2px 4px rgba(0, 0, 0, 0.9);
}

/* 具名立绘角色彻底隐藏 fallback 文字盒子 */
div.custom-nvn-dialogue:is([data-char*="02-D"], [data-char*="利德尔次女"], [data-char*="妈妈"], [data-char*="妹妹"], [data-char*="母亲"], [data-char*="王铠"], 
  [data-char*="克蕾雅"], [data-char*="莉莉娅"], [data-char*="莉莉娅"],
  [data-char*="梅拉"], [data-char*="梅拉妮"], [data-char*="艾拉"], [data-char*="拉姆"], 
  [data-char*="拉姆内"], [data-char*="阿黛拉"], [data-char*="伊莉丝"], [data-char*="丽塔"], 
  [data-char*="菲娅"], [data-char*="菲娅娜"], [data-char*="露娜"], 
  [data-char*="桑尼"], [data-char*="萨菲亚"], [data-char*="凯埃尔"], [data-char*="卡伊埃尔"],
  [data-char*="夏洛特"], [data-char*="法妮雅"], [data-char*="响木天音"], [data-char*="芙洛蒂"],
  [data-char*="艾妮希雅"], [data-char*="凯拉涅斯"], [data-char*="拉菲莉娅"], [data-char*="赛蕾姆丝"],
  [data-char*="小忆"], [data-char*="斯雅"], [data-char*="盖欧露易丝"], [data-char*="露易丝"], 
  [data-char*="斯提亚拉"], [data-char*="提亚拉"], [data-char*="古伊奈"], [data-char*="雷克西斯"], 
  [data-char*="帕特里琪娅"], [data-char*="奇诺米"], [data-char*="蒂莎"], [data-char*="加莉泰娅"],
  [data-char*="小春"], [data-char*="五月雨"], [data-char*="大王"],
  [data-char*="艾尔希"], [data-char*="狄娜"], [data-char*="卡莲"], [data-char*="柯萝特"],
  [data-char*="芙萝"], [data-char*="艾珀尔"], [data-char*="芙洛瑞丝"], [data-char*="布娜"],
  [data-char*="幽妮娅"], [data-char*="塞伊"], [data-char*="利奥"],
  [data-char*="托莉娜"], [data-char*="一之濑雫"], [data-char*="爱丽丝"], [data-char*="诺登"], [data-char*="小红帽"], [data-char*="普利凯特"],
  [data-char*="梅贝尔"], [data-char*="玛丽·安"], [data-char*="莉耶芙"], [data-char*="公爵夫人"],
  [data-char*="帽子屋"], [data-char*="三月兔"], [data-char*="格里菲"], [data-char*="假海龟"],
  [data-char*="渡渡"], [data-char*="希夏"], [data-char*="比尔"], [data-char*="维多利雅"],
  [data-char*="弗洛伦斯"], [data-char*="罗丽娜"], [data-char*="格尔达"], [data-char*="尤妮丝"],
  [data-char*="莱登"], [data-char*="克缇"], [data-char*="贾巴沃克"], [data-char*="贾布加布"],
  [data-char*="班达斯奈奇"], [data-char*="希伏契"], [data-char*="柴郡猫"], [data-char*="人偶爱丽丝"],
  [data-char*="雏鸟"], [data-char*="蛇神"], [data-char*="丽薇歌塔"], [data-char*="丽薇歌塔·柯涅尔"], [data-char*="伊夏"], [data-char*="伊夏·波利斯塔切尔"], [data-char*="南丁格尔"], [data-char*="女儿"], [data-char*="女儿爱丽丝"], [data-char*="妈妈爱丽丝"], [data-char*="妹妹爱丽丝"], [data-char*="崔德尔·蒂"], [data-char*="崔德尔·达姆"], [data-char*="德尔菲尼"], [data-char*="德尔菲尼·柯涅尔"], [data-char*="提尔德"], [data-char*="提尔德·柯涅尔"], [data-char*="摇篮的爱莉丝"], [data-char*="普莉姆拉"], [data-char*="梅法"], [data-char*="梅法·格里亚德"], [data-char*="母亲爱丽丝"], [data-char*="爱·丽·丝"], [data-char*="爱丽丝·利德尔"], [data-char*="爱莉丝"], [data-char*="蒂格蕾娜"], [data-char*="蒂格蕾娜·索菈"], [data-char*="诺艾儿"], [data-char*="诺艾儿·柯涅尔"], [data-char*="诺艾儿·私"], [data-char*="诺艾尔"], [data-char*="诺艾尔·柯涅尔"], [data-char*="诺艾尔·私"], [data-char*="阿尔玛"], [data-char*="阿尔玛·奥普菲帕姆"]
) .custom-nvn-avatar-fallback-box {
  display: none !important;
}

/* ====== 内容栏与名牌 ====== */
.custom-nvn-content {
  display: flex !important;
  flex-direction: column;
  flex: 1 1 0;
  min-width: 0;
  padding-top: 2px;
}

.custom-nvn-name-plate {
  display: inline-flex;
  align-items: center;
  align-self: flex-start;
  gap: 8px;
  position: relative;
  min-height: 36px;
  padding: 2px 24px 2px 10px;
  margin-bottom: 6px;
  background: linear-gradient(90deg, rgba(var(--rgb), 0.22) 0%, rgba(var(--rgb), 0.04) 70%, transparent 100%);
  border-top: 1px solid rgba(var(--rgb), 0.35);
  border-bottom: 1px solid rgba(var(--rgb), 0.35);
  border-left: 3px solid var(--main);
  border-right: none !important;
  border-radius: 4px 16px 16px 4px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
}

.custom-nvn-rose-crest {
  display: none !important;
}

/* 享有花朵名牌的角色 */
div.custom-nvn-dialogue:is(
  [data-char*="克蕾雅"], [data-char*="卢克蕾齐雅"], [data-char*="莉莉娅"], [data-char*="莉莉娅"],
  [data-char*="梅拉"], [data-char*="梅拉妮"], [data-char*="艾拉"], [data-char*="拉姆"], 
  [data-char*="拉姆内"], [data-char*="阿黛拉"], [data-char*="伊莉丝"], [data-char*="丽塔"], 
  [data-char*="菲娅"], [data-char*="菲娅娜"], [data-char*="大魔女"], [data-char*="露娜"], 
  [data-char*="桑尼"], [data-char*="萨菲亚"], [data-char*="凯埃尔"], [data-char*="卡伊埃尔"],
  [data-char*="夏洛特"], [data-char*="法妮雅"], [data-char*="响木天音"], [data-char*="芙洛蒂"],
  [data-char*="艾妮希雅"], [data-char*="凯拉涅斯"], [data-char*="小忆"], [data-char*="斯雅"],
  [data-char*="盖欧露易丝"], [data-char*="露易丝"], [data-char*="斯提亚拉"], [data-char*="提亚拉"], 
  [data-char*="古伊奈"], [data-char*="雷克西斯"], [data-char*="帕特里琪娅"], [data-char*="奇诺米"], 
  [data-char*="蒂莎"], [data-char*="加莉泰娅"], [data-char*="小春"], [data-char*="五月雨"], [data-char*="大王"],
  [data-char*="艾尔希"], [data-char*="狄娜"], [data-char*="卡莲"], [data-char*="柯萝特"],
  [data-char*="芙萝"], [data-char*="艾珀尔"], [data-char*="芙洛瑞丝"], [data-char*="布娜"],
  [data-char*="幽妮娅"], [data-char*="塞伊"], [data-char*="利奥"],
  [data-char*="托莉娜"], [data-char*="一之濑雫"], [data-char*="爱丽丝"], [data-char*="诺登"], [data-char*="小红帽"], [data-char*="普利凯特"],
  [data-char*="梅贝尔"], [data-char*="玛丽·安"], [data-char*="莉耶芙"], [data-char*="公爵夫人"],
  [data-char*="帽子屋"], [data-char*="三月兔"], [data-char*="格里菲"], [data-char*="假海龟"],
  [data-char*="渡渡"], [data-char*="希夏"], [data-char*="比尔"], [data-char*="维多利雅"],
  [data-char*="弗洛伦斯"], [data-char*="罗丽娜"], [data-char*="格尔达"], [data-char*="尤妮丝"],
  [data-char*="莱登"], [data-char*="克缇"], [data-char*="贾巴沃克"], [data-char*="贾布加布"],
  [data-char*="班达斯奈奇"], [data-char*="希伏契"], [data-char*="柴郡猫"], [data-char*="人偶爱丽丝"],
  [data-char*="崔德尔"], [data-char*="雏鸟"], [data-char*="蛇神"],
  [data-player^="user"], [data-player="true"], [is_user="true"] *, .is-user-avatar
, [data-char*="丽薇歌塔"], [data-char*="丽薇歌塔·柯涅尔"], [data-char*="伊夏"], [data-char*="伊夏·波利斯塔切尔"], [data-char*="南丁格尔"], [data-char*="女儿"], [data-char*="女儿爱丽丝"], [data-char*="妈妈爱丽丝"], [data-char*="妹妹爱丽丝"], [data-char*="崔德尔·蒂"], [data-char*="崔德尔·达姆"], [data-char*="德尔菲尼"], [data-char*="德尔菲尼·柯涅尔"], [data-char*="拉菲莉娅"], [data-char*="提尔德"], [data-char*="提尔德·柯涅尔"], [data-char*="摇篮的爱莉丝"], [data-char*="普莉姆拉"], [data-char*="梅法"], [data-char*="梅法·格里亚德"], [data-char*="母亲爱丽丝"], [data-char*="爱·丽·丝"], [data-char*="爱丽丝·利德尔"], [data-char*="爱莉丝"], [data-char*="蒂格蕾娜"], [data-char*="蒂格蕾娜·索菈"], [data-char*="诺艾儿"], [data-char*="诺艾儿·柯涅尔"], [data-char*="诺艾儿·私"], [data-char*="诺艾尔"], [data-char*="诺艾尔·柯涅尔"], [data-char*="诺艾尔·私"], [data-char*="赛蕾姆丝"], [data-char*="阿尔玛"], [data-char*="阿尔玛·奥普菲帕姆"], [data-char*="IV"], [data-char*="王铠古伊奈"], [data-char*="王铠盖欧露易丝"], [data-char*="艾尔希IV"], [data-char*="驱魔"], [data-char*="驱魔夏洛特"], [data-char*="魔化"], [data-char*="魔化托莉娜"]) .custom-nvn-rose-crest {  
  display: flex !important;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  color: var(--main);
  filter: drop-shadow(0 0 4px rgba(var(--rgb), 0.6));
  flex-shrink: 0;
}
.custom-nvn-rose-crest svg { width: 100%; height: 100%; }

.custom-nvn-name-box {
  display: inline-flex;
  align-items: baseline;
  color: var(--stage-text);
  font-size: 1.1em;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.7);
}

.custom-nvn-name-initial {
  color: var(--main);
  font-size: 1.4em;
  font-weight: 900;
  line-height: 1;
  margin-right: 2px;
  text-shadow: 0 0 8px rgba(var(--rgb), 0.5);
}

.custom-nvn-name-rest {
  color: #ffffff;
  opacity: 0.92;
}

/* ====== 神态动作微章 ====== */
.custom-nvn-action {
  display: inline-flex;
  align-items: center;
  background: rgba(var(--rgb), 0.16);
  border: 1px solid rgba(var(--rgb), 0.4);
  border-radius: 8px;
  padding: 1px 7px;
  color: var(--main);
  font-size: 0.72em;
  font-weight: 600;
  letter-spacing: 0.04em;
  margin-left: 2px;
}
.custom-nvn-action:empty { display: none !important; }
.custom-nvn-telepathy-tag { display: none; }

/* ====== 心灵感应 ====== */
[data-quote="*"] .custom-nvn-telepathy-tag, [data-quote="〈"] .custom-nvn-telepathy-tag, [data-quote="《"] .custom-nvn-telepathy-tag, [data-quote="‹"] .custom-nvn-telepathy-tag, [data-quote="『"] .custom-nvn-telepathy-tag { 
  display: inline-flex !important; 
  align-items: center !important; 
  margin-left: 2px !important; 
  padding: 1px 7px !important; 
  border-radius: 8px !important; 
  font-size: 0.72em !important; 
  font-weight: 600 !important; 
  letter-spacing: 0.04em !important; 
  background: rgba(var(--rgb), 0.16) !important; 
  border: 1px solid rgba(var(--rgb), 0.4) !important; 
  color: var(--main) !important; 
}
[data-quote="〈"] .custom-nvn-quote-mark.custom-left::before, [data-quote="‹"] .custom-nvn-quote-mark.custom-left::before { content: "〈" !important; }
[data-quote="〈"] .custom-nvn-quote-mark.custom-right::before, [data-quote="‹"] .custom-nvn-quote-mark.custom-right::before { content: "〉" !important; }
[data-quote="《"] .custom-nvn-quote-mark.custom-left::before { content: "《" !important; }
[data-quote="《"] .custom-nvn-quote-mark.custom-right::before { content: "》" !important; }
[data-quote="『"] .custom-nvn-quote-mark.custom-left::before { content: "『" !important; }
[data-quote="『"] .custom-nvn-quote-mark.custom-right::before { content: "』" !important; }
[data-quote="〈"] .custom-nvn-primary, [data-quote="‹"] .custom-nvn-primary { color: #e8dcff !important; text-shadow: 0 0 8px rgba(var(--rgb), .45), 0 1px 3px rgba(0,0,0,.85) !important; }
[data-quote="〈"] .custom-nvn-text, [data-quote="‹"] .custom-nvn-text { border-left-color: rgba(var(--rgb), .8) !important; }
[data-quote="〈"] .custom-nvn-text::before, [data-quote="‹"] .custom-nvn-text::before { background: var(--main) !important; box-shadow: 0 0 8px rgba(var(--rgb), .7) !important; }
[data-quote="〈"] [class*="name-plate"], [data-quote="‹"] [class*="name-plate"] { border-top-color: rgba(var(--rgb), .55) !important; border-bottom-color: rgba(var(--rgb), .55) !important; border-left-color: rgba(var(--rgb), .8) !important; border-right-color: rgba(var(--rgb), .8) !important; box-shadow: 0 0 10px rgba(var(--rgb), .16), inset 0 0 12px rgba(var(--rgb), .06) !important; }
[data-quote="〈"] [class*="avatar-img"], [data-quote="‹"] [class*="avatar-img"] { border-color: rgba(var(--rgb), .7) !important; box-shadow: 0 0 10px rgba(var(--rgb), .18) !important; }

/* ====== 台词文本区 ====== */
.custom-nvn-text {
  position: relative;
  display: flex !important;
  align-items: baseline;
  background: transparent !important;
  border-left: 2px solid rgba(var(--rgb), 0.6) !important;
  border-radius: 0 !important;
  padding: 3px 0 3px 14px !important;
  margin-top: 2px;
  box-shadow: none !important;
}

.custom-nvn-text::before {
  content: "";
  position: absolute;
  left: -4px;
  top: 9px;
  width: 6px;
  height: 6px;
  background: var(--main);
  transform: rotate(45deg);
  border-radius: 1px;
  box-shadow: 0 0 8px rgba(var(--rgb), 0.7);
}

.custom-nvn-quote-mark {
  color: var(--main);
  font-family: inherit;
  font-size: 1.15em;
  font-weight: 700;
  opacity: 0.85;
  flex-shrink: 0;
  user-select: none;
}
.custom-nvn-quote-mark.custom-left { margin-right: 6px; }
.custom-nvn-quote-mark.custom-right { margin-left: 6px; }
.custom-nvn-quote-mark.custom-left::before { content: "「"; }
.custom-nvn-quote-mark.custom-right::before { content: "」"; }

.custom-nvn-primary {
  display: inline;
  color: var(--stage-text);
  font-size: 1.05em;
  line-height: 1.8;
  letter-spacing: 0.05em;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.8);
  word-break: break-word;
  text-indent: 0 !important;
  margin-bottom: 6px;
}

/* ====== 动作描写区 ====== */
.custom-nvn-motion {
  display: block !important;
  margin-top: 8px;
  padding-left: 14px;
  padding-bottom: 6px;
  color: var(--motion-color) !important;
  font-size: 0.9em;
  line-height: 1.6;
  letter-spacing: 0.02em;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.6);
  word-break: break-word;
  position: relative;
}

.custom-nvn-motion::after {
  content: "";
  display: block;
  margin-top: 7px;
  width: 100%;
  height: 1px;
  background: linear-gradient(90deg, rgba(var(--rgb), 0.5) 0%, rgba(var(--rgb), 0.12) 50%, transparent 100%);
}
.custom-nvn-motion:empty { display: none !important; }

/* =========================================================================
 * 🌟  / 玩家行专属体系
 * ========================================================================= */
[is_user="true"] .custom-nvn-dialogue,
.custom-nvn-dialogue:is([data-player^="user"], [data-player="true"]) {
  --main: #e2e8f0 !important;
  --sub: #ffffff !important;
  --rgb: 226, 232, 240 !important;
  --motion-color: #cbd5e1 !important;
  flex-direction: row-reverse !important;
  align-self: flex-end !important;
  margin-left: auto !important;
}

[is_user="true"] .custom-nvn-dialogue .custom-nvn-avatar-img,
.custom-nvn-dialogue:is([data-player^="user"], [data-player="true"]) .custom-nvn-avatar-img {
  border: 1.5px solid rgba(226, 232, 240, 0.65) !important;
}

div.custom-nvn-dialogue:is([data-player^="user"], [data-player="true"], [is_user="true"] *):not(:is(
  [data-char*="克蕾雅"], [data-char*="卢克蕾齐雅"], [data-char*="莉莉娅"], [data-char*="莉莉娅"],
  [data-char*="梅拉"], [data-char*="梅拉妮"], [data-char*="艾拉"], [data-char*="拉姆"], 
  [data-char*="拉姆内"], [data-char*="阿黛拉"], [data-char*="伊莉丝"], [data-char*="丽塔"], 
  [data-char*="菲娅"], [data-char*="菲娅娜"], [data-char*="大魔女"], [data-char*="露娜"], 
  [data-char*="桑尼"], [data-char*="萨菲亚"], [data-char*="凯埃尔"], [data-char*="卡伊埃尔"],
  [data-char*="夏洛特"], [data-char*="法妮雅"], [data-char*="响木天音"], [data-char*="芙洛蒂"],
  [data-char*="艾妮希雅"], [data-char*="凯拉涅斯"], [data-char*="拉菲莉娅"], [data-char*="赛蕾姆丝"],
  [data-char*="小忆"], [data-char*="斯雅"], [data-char*="盖欧露易丝"], [data-char*="露易丝"], 
  [data-char*="斯提亚拉"], [data-char*="提亚拉"], [data-char*="古伊奈"], [data-char*="雷克西斯"], 
  [data-char*="帕特里琪娅"], [data-char*="奇诺米"], [data-char*="蒂莎"], [data-char*="加莉泰娅"],
  [data-char*="小春"], [data-char*="五月雨"], [data-char*="大王"],
  [data-char*="艾尔希"], [data-char*="狄娜"], [data-char*="卡莲"], [data-char*="柯萝特"],
  [data-char*="芙萝"], [data-char*="艾珀尔"], [data-char*="芙洛瑞丝"], [data-char*="布娜"],
  [data-char*="幽妮娅"], [data-char*="塞伊"], [data-char*="利奥"],
  [data-char*="托莉娜"], [data-char*="一之濑雫"], , [data-char*="IV"], [data-char*="三月兔"], [data-char*="丽薇歌塔"], [data-char*="丽薇歌塔·柯涅尔"], [data-char*="人偶爱丽丝"], [data-char*="伊夏"], [data-char*="伊夏·波利斯塔切尔"], [data-char*="假海龟"], [data-char*="克缇"], [data-char*="公爵夫人"], [data-char*="南丁格尔"], [data-char*="女儿"], [data-char*="女儿爱丽丝"], [data-char*="妈妈爱丽丝"], [data-char*="妹妹爱丽丝"], [data-char*="小红帽"], [data-char*="尤妮丝"], [data-char*="崔德尔·蒂"], [data-char*="崔德尔·达姆"], [data-char*="希伏契"], [data-char*="希夏"], [data-char*="帽子屋"], [data-char*="弗洛伦斯"], [data-char*="德尔菲尼"], [data-char*="德尔菲尼·柯涅尔"], [data-char*="提尔德"], [data-char*="提尔德·柯涅尔"], [data-char*="摇篮的爱莉丝"], [data-char*="普利凯特"], [data-char*="普莉姆拉"], [data-char*="柴郡猫"], [data-char*="格尔达"], [data-char*="格里菲"], [data-char*="梅法"], [data-char*="梅法·格里亚德"], [data-char*="梅贝尔"], [data-char*="母亲爱丽丝"], [data-char*="比尔"], [data-char*="渡渡"], [data-char*="爱·丽·丝"], [data-char*="爱丽丝"], [data-char*="爱丽丝·利德尔"], [data-char*="爱莉丝"], [data-char*="玛丽·安"], [data-char*="班达斯奈奇"], [data-char*="维多利雅"], [data-char*="罗丽娜"], [data-char*="莉耶芙"], [data-char*="莱登"], [data-char*="蒂格蕾娜"], [data-char*="蒂格蕾娜·索菈"], [data-char*="蛇神"], [data-char*="诺登"], [data-char*="诺艾儿"], [data-char*="诺艾儿·柯涅尔"], [data-char*="诺艾儿·私"], [data-char*="诺艾尔"], [data-char*="诺艾尔·柯涅尔"], [data-char*="诺艾尔·私"], [data-char*="贾巴沃克"], [data-char*="贾布加布"], [data-char*="阿尔玛"], [data-char*="阿尔玛·奥普菲帕姆"], [data-char*="雏鸟"], [data-char*="驱魔"], [data-char*="魔化"])) .custom-nvn-avatar-img {
  background-image: radial-gradient(ellipse at center, rgba(226, 232, 240, 0.18) 0%, rgba(16, 18, 22, 0.92) 100%) !important;
}

[is_user="true"] .custom-nvn-dialogue .custom-nvn-name-plate,
.custom-nvn-dialogue:is([data-player^="user"], [data-player="true"]) .custom-nvn-name-plate {
  align-self: flex-end !important;
  flex-direction: row-reverse !important;
  padding: 2px 10px 2px 24px !important;
  background: linear-gradient(270deg, rgba(226, 232, 240, 0.22) 0%, rgba(226, 232, 240, 0.04) 70%, transparent 100%) !important;
  border-top: 1px solid rgba(226, 232, 240, 0.45) !important;
  border-bottom: 1px solid rgba(226, 232, 240, 0.45) !important;
  border-left: none !important;
  border-right: 3px solid #e2e8f0 !important;
  border-radius: 16px 4px 4px 16px !important;
}

[is_user="true"] .custom-nvn-dialogue .custom-nvn-text,
.custom-nvn-dialogue:is([data-player^="user"], [data-player="true"]) .custom-nvn-text {
  border-left: none !important;
  border-right: 2px solid rgba(226, 232, 240, 0.75) !important;
  padding-left: 0 !important;
  padding-right: 14px !important;
  justify-content: flex-end !important;
}

[is_user="true"] .custom-nvn-dialogue .custom-nvn-text::before,
.custom-nvn-dialogue:is([data-player^="user"], [data-player="true"]) .custom-nvn-text::before {
  left: auto !important;
  right: -4px !important;
  background: #e2e8f0 !important;
  box-shadow: 0 0 8px rgba(226, 232, 240, 0.8) !important;
}

[is_user="true"] .custom-nvn-dialogue .custom-nvn-motion,
.custom-nvn-dialogue:is([data-player^="user"], [data-player="true"]) .custom-nvn-motion {
  text-align: right !important;
  padding-left: 0 !important;
  padding-right: 14px !important;
}

[is_user="true"] .custom-nvn-dialogue .custom-nvn-motion::after,
.custom-nvn-dialogue:is([data-player^="user"], [data-player="true"]) .custom-nvn-motion::after {
  background: linear-gradient(270deg, rgba(226, 232, 240, 0.55) 0%, rgba(226, 232, 240, 0.12) 50%, transparent 100%) !important;
}

/* =========================================================================
 * 📜 纯 CSS 西幻高频译名人名字头池（莫兰迪体系）
 * ========================================================================= */
div.custom-nvn-dialogue:is(
  [data-char^="约"], [data-char^="托"], [data-char^="莫"], [data-char^="罗"], 
  [data-char^="保"], [data-char^="道"], [data-char^="汤"], [data-char^="丹"], 
  [data-char^="达"], [data-char^="唐"], [data-char^="迪"], [data-char^="度"], 
  [data-char^="戴"], [data-char^="德"], [data-char^="主"]
):not([data-char*="狄娜"]):not([data-char*="托莉娜"]) { 
  --main: #9c8c7c !important; --rgb: 156, 140, 124 !important; --motion-color: #b8ab9d !important; 
}

div.custom-nvn-dialogue:is(
  [data-char^="西"], [data-char^="修"], [data-char^="塞"], [data-char^="辛"], 
  [data-char^="萨"], [data-char^="苏"], [data-char^="斯"], [data-char^="索"], 
  [data-char^="森"], [data-char^="瑟"], [data-char^="肖"], [data-char^="夏"], [data-char^="席"]
):not([data-char*="夏洛特"]):not([data-char*="斯提亚拉"]):not([data-char*="斯雅"]):not([data-char*="塞伊"]) {
  --main: #7a9187 !important; --rgb: 122, 145, 135 !important; --motion-color: #9db0a7 !important;
}

div.custom-nvn-dialogue:is(
  [data-char^="艾"], [data-char^="安"], [data-char^="阿"], [data-char^="奥"], 
  [data-char^="亚"], [data-char^="恩"], [data-char^="厄"], [data-char^="尤"], 
  [data-char^="欧"], [data-char^="埃"], [data-char^="乌"]
):not([data-char*="艾拉"]):not([data-char*="阿黛拉"]):not([data-char*="艾妮希雅"]):not([data-char*="艾尔希"]):not([data-char*="艾珀尔"]) {
  --main: #96899e !important; --rgb: 150, 137, 158 !important; --motion-color: #b5abbd !important;
}

div.custom-nvn-dialogue:is(
  [data-char^="巴"], [data-char^="布"], [data-char^="贝"], [data-char^="博"], 
  [data-char^="宾"], [data-char^="鲍"], 
  [data-char^="伯"], [data-char^="派"], [data-char^="彼"]
):not([data-char*="布娜"]) { 
  --main: #85929e !important; --rgb: 133, 146, 158 !important; --motion-color: #a6b1bc !important; 
}

div.custom-nvn-dialogue:is(
  [data-char^="杰"], [data-char^="吉"], [data-char^="格"], [data-char^="古"], 
  [data-char^="金"], [data-char^="高"], [data-char^="戈"], [data-char^="盖"], 
  [data-char^="加"], [data-char^="贾"], [data-char^="查"], [data-char^="老"], [data-char^="商"]
):not([data-char*="古伊奈"]):not([data-char*="加莉泰娅"]):not([data-char*="盖欧露易丝"]) {
  --main: #9e927c !important; --rgb: 158, 146, 124 !important; --motion-color: #bcb29f !important;
}

div.custom-nvn-dialogue:is(
  [data-char^="雷"], [data-char^="莱"], [data-char^="鲁"], [data-char^="伦"], 
  [data-char^="里"], [data-char^="洛"], [data-char^="兰"], [data-char^="利"], 
  [data-char^="卢"], [data-char^="卫"], [data-char^="兵"], [data-char^="骑"], [data-char^="警"]
):not([data-char*="卢克蕾齐雅"]):not([data-char*="雷克西斯"]):not([data-char*="利奥"]) {
  --main: #7a8b9e !important; --rgb: 122, 139, 158 !important; --motion-color: #9caab9 !important;
}

div.custom-nvn-dialogue:is(
  [data-char^="观"], [data-char^="赫"], [data-char^="哈"], [data-char^="霍"], 
  [data-char^="汉"], [data-char^="海"], [data-char^="亨"], 
  [data-char^="费"], [data-char^="弗"], [data-char^="福"], [data-char^="法"]
):not([data-char*="法妮雅"]) {
  --main: #9e8585 !important; --rgb: 158, 133, 133 !important; --motion-color: #bda6a6 !important;
}

div.custom-nvn-dialogue:is(
  [data-char^="卡"], [data-char^="科"], [data-char^="康"], [data-char^="库"], 
  [data-char^="肯"], [data-char^="柯"], [data-char^="客"], [data-char^="店"], 
  [data-char^="路"], [data-char^="男"], [data-char^="市"], [data-char^="村"]
):not([data-char*="卡伊埃尔"]):not([data-char*="卡莲"]):not([data-char*="柯萝特"]) {
  --main: #7c918f !important; --rgb: 124, 145, 143 !important; --motion-color: #9eb1af !important;
}

/* =========================================================================
 * 🌈 所有角色专属色彩定义
 * ========================================================================= */
div.custom-nvn-dialogue[data-char*="克蕾雅"] { --main: #e6b85c !important; --sub: #ffe89e !important; --rgb: 230, 184, 92 !important; --motion-color: #dfc698 !important; }
div.custom-nvn-dialogue:is([data-char*="莉莉娅"], [data-char*="莉莉娅"]) { --main: #d0dbe5 !important; --sub: #ffffff !important; --rgb: 208, 219, 229 !important; --motion-color: #d6e2ed !important; }
div.custom-nvn-dialogue:is([data-char*="梅拉"], [data-char*="梅拉妮"]) { --main: #8c899c !important; --sub: #b8b6c8 !important; --rgb: 140, 137, 156 !important; --motion-color: #b3b0c4 !important; }
div.custom-nvn-dialogue[data-char*="艾拉"] { --main: #c084fc !important; --sub: #ebd5ff !important; --rgb: 192, 132, 252 !important; --motion-color: #d9b3ff !important; }
div.custom-nvn-dialogue:is([data-char*="拉姆"], [data-char*="拉姆内"]) { --main: #ff6584 !important; --sub: #fecdd3 !important; --rgb: 255, 101, 132 !important; --motion-color: #fbaec0 !important; }
div.custom-nvn-dialogue[data-char*="阿黛拉"] { --main: #b8845f !important; --sub: #dec3ab !important; --rgb: 184, 132, 95 !important; --motion-color: #cda282 !important; }
div.custom-nvn-dialogue[data-char*="伊莉丝"] { --main: #a8b8cc !important; --sub: #dce5f0 !important; --rgb: 168, 184, 204 !important; --motion-color: #c3d2e3 !important; }
div.custom-nvn-dialogue[data-char*="丽塔"] { --main: #e04b4b !important; --sub: #fca5a5 !important; --rgb: 224, 75, 75 !important; --motion-color: #f87171 !important; }
div.custom-nvn-dialogue:is([data-char*="菲娅娜"], [data-char*="菲娅"]) { --main: #8e7cc3 !important; --sub: #c9bbf0 !important; --rgb: 142, 124, 195 !important; --motion-color: #b4a7d6 !important; }
div.custom-nvn-dialogue:is([data-char*="凯埃尔"], [data-char*="卡伊埃尔"]) { --main: #9bb0c9 !important; --sub: #c5d4e6 !important; --rgb: 155, 176, 201 !important; --motion-color: #b5c7db !important; }
div.custom-nvn-dialogue[data-char*="露娜"] { --main: #7e7391 !important; --sub: #a89dbb !important; --rgb: 126, 115, 145 !important; --motion-color: #aba1bd !important; }
div.custom-nvn-dialogue[data-char*="桑尼"] { --main: #ff789e !important; --sub: #ffb3c7 !important; --rgb: 255, 120, 158 !important; --motion-color: #ff9cb7 !important; }
div.custom-nvn-dialogue[data-char*="萨菲亚"] { --main: #4a9ff5 !important; --sub: #96c8fb !important; --rgb: 74, 159, 245 !important; --motion-color: #7bb8f7 !important; }
div.custom-nvn-dialogue[data-char*="夏洛特"]:not([data-char*="驱魔"]) { --main: #9e6b47 !important; --sub: #d4a882 !important; --rgb: 158, 107, 71 !important; --motion-color: #c49a78 !important; }
div.custom-nvn-dialogue[data-char*="驱魔夏洛特"] { --main: #c9a227 !important; --sub: #f0dca0 !important; --rgb: 201, 162, 39 !important; --motion-color: #dcc36a !important; }
div.custom-nvn-dialogue[data-char*="法妮雅"] { --main: #5bc0be !important; --sub: #a8e6e4 !important; --rgb: 91, 192, 190 !important; --motion-color: #7fd4d2 !important; }
div.custom-nvn-dialogue[data-char*="响木天音"] { --main: #4a9eb8 !important; --sub: #9fd4e4 !important; --rgb: 74, 158, 184 !important; --motion-color: #6bb8d4 !important; }
div.custom-nvn-dialogue[data-char*="芙洛蒂"] { --main: #7ab87a !important; --sub: #b8e0b8 !important; --rgb: 122, 184, 122 !important; --motion-color: #98ce98 !important; }
div.custom-nvn-dialogue[data-char*="艾妮希雅"] { --main: #e8a8c0 !important; --sub: #f8d0dc !important; --rgb: 232, 168, 192 !important; --motion-color: #f0c0d0 !important; }
div.custom-nvn-dialogue[data-char*="凯拉涅斯"] { --main: #a88cd8 !important; --sub: #d4c0f0 !important; --rgb: 168, 140, 216 !important; --motion-color: #c4aae8 !important; }
div.custom-nvn-dialogue[data-char*="小忆"] { --main: #eef2f8 !important; --sub: #ffffff !important; --rgb: 238, 242, 248 !important; --motion-color: #d8e0ea !important; }
div.custom-nvn-dialogue[data-char*="斯雅"] { --main: #5f4b8b !important; --sub: #a08cc8 !important; --rgb: 95, 75, 139 !important; --motion-color: #8574b0 !important; }
div.custom-nvn-dialogue[data-char*="蒂莎"] { --main: #52b788 !important; --sub: #b7e4c7 !important; --rgb: 82, 183, 136 !important; --motion-color: #74c69d !important; }
div.custom-nvn-dialogue[data-char*="奇诺米"] { --main: #f28482 !important; --sub: #fcd5ce !important; --rgb: 242, 132, 130 !important; --motion-color: #f5a6a5 !important; }
div.custom-nvn-dialogue[data-char*="帕特里琪娅"] { --main: #ff4242 !important; --sub: #ff9999 !important; --rgb: 255, 66, 66 !important; --motion-color: #fca5a5 !important; }
div.custom-nvn-dialogue[data-char*="加莉泰娅"] { --main: #a6b1e1 !important; --sub: #dcd6f7 !important; --rgb: 166, 177, 225 !important; --motion-color: #bac4ec !important; }
div.custom-nvn-dialogue[data-char*="雷克西斯"] { --main: #6ba4b8 !important; --sub: #bfe3ec !important; --rgb: 107, 164, 184 !important; --motion-color: #92bfcf !important; }
div.custom-nvn-dialogue:is([data-char*="盖欧露易丝"], [data-char*="露易丝"]) { --main: #e56b6f !important; --sub: #fbc3bc !important; --rgb: 229, 107, 111 !important; --motion-color: #ea8c8f !important; }
div.custom-nvn-dialogue:is([data-char*="斯提亚拉"], [data-char*="提亚拉"]) { --main: #38a3a5 !important; --sub: #80ed99 !important; --rgb: 56, 163, 165 !important; --motion-color: #57cc99 !important; }
div.custom-nvn-dialogue[data-char*="古伊奈"] { --main: #e9a03b !important; --sub: #fbd686 !important; --rgb: 233, 160, 59 !important; --motion-color: #f1b764 !important; }
div.custom-nvn-dialogue[data-char*="小春"] { --main: #f39c12 !important; --sub: #fdebd0 !important; --rgb: 243, 156, 18 !important; --motion-color: #f8c471 !important; }
div.custom-nvn-dialogue[data-char*="五月雨"] { --main: #5dade2 !important; --sub: #ebf5fb !important; --rgb: 93, 173, 226 !important; --motion-color: #85c1e9 !important; }
div.custom-nvn-dialogue[data-char*="大王"] { --main: #922b21 !important; --sub: #f2d7d5 !important; --rgb: 146, 43, 33 !important; --motion-color: #c0392b !important; }

/* 🌟 本次新增角色色彩定义 */
div.custom-nvn-dialogue[data-char*="艾尔希"]:not([data-char*="IV"]) { --main: #68a0e8 !important; --sub: #cfe3fc !important; --rgb: 104, 160, 232 !important; --motion-color: #8cbcf5 !important; }
div.custom-nvn-dialogue[data-char*="艾尔希IV"] { --main: #4a8ee0 !important; --sub: #b8d9fb !important; --rgb: 74, 142, 224 !important; --motion-color: #72abf0 !important; }
div.custom-nvn-dialogue[data-char*="狄娜"] { --main: #ea6982 !important; --sub: #fbc3bc !important; --rgb: 234, 105, 130 !important; --motion-color: #f2849e !important; }
div.custom-nvn-dialogue[data-char*="卡莲"] { --main: #f1b01c !important; --sub: #fee39f !important; --rgb: 241, 176, 28 !important; --motion-color: #f8c857 !important; }
div.custom-nvn-dialogue[data-char*="柯萝特"] { --main: #8d5b38 !important; --sub: #cca68d !important; --rgb: 141, 91, 56 !important; --motion-color: #b5815d !important; }
div.custom-nvn-dialogue[data-char*="幽妮娅"] { --main: #845ec2 !important; --sub: #d5c6e8 !important; --rgb: 132, 94, 194 !important; --motion-color: #a17fe0 !important; }
div.custom-nvn-dialogue[data-char*="芙萝"] { --main: #48a999 !important; --sub: #a0e0d6 !important; --rgb: 72, 169, 153 !important; --motion-color: #6ec5b6 !important; }
div.custom-nvn-dialogue[data-char*="艾珀尔"] { --main: #d97736 !important; --sub: #fed7aa !important; --rgb: 217, 119, 54 !important; --motion-color: #ea9965 !important; }
div.custom-nvn-dialogue[data-char*="芙洛瑞丝"] { --main: #c779d0 !important; --sub: #f3d3f7 !important; --rgb: 199, 121, 208 !important; --motion-color: #da9fe1 !important; }
div.custom-nvn-dialogue[data-char*="布娜"] { --main: #a27b5c !important; --sub: #ddc5b0 !important; --rgb: 162, 123, 92 !important; --motion-color: #c19d80 !important; }
div.custom-nvn-dialogue[data-char*="塞伊"] { --main: #578ca9 !important; --sub: #b0d3e8 !important; --rgb: 87, 140, 169 !important; --motion-color: #7aaec9 !important; }
div.custom-nvn-dialogue[data-char*="利奥"] { --main: #b3541e !important; --sub: #f7b28d !important; --rgb: 179, 84, 30 !important; --motion-color: #d67943 !important; }
/* 托莉娜（白金色）、魔化托莉娜（纯银冷色）、一之濑雫（淡紫色） */
div.custom-nvn-dialogue[data-char*="托莉娜"]:not([data-char*="魔化"]) { --main: #e2c077 !important; --sub: #fbf5e6 !important; --rgb: 226, 192, 119 !important; --motion-color: #ebd39c !important; }
div.custom-nvn-dialogue[data-char*="魔化托莉娜"] { --main: #aebacd !important; --sub: #eef2f7 !important; --rgb: 174, 186, 205 !important; --motion-color: #c4d0df !important; }
div.custom-nvn-dialogue:is([data-char*="一之濑雫"], ) { --main: #b49bef !important; --sub: #f1ebfc !important; --rgb: 180, 155, 239 !important; --motion-color: #cbbaee !important; }
/* =========================================================================
 * 🌟 新增 Black Souls 体系角色专属色彩（四个爱丽丝防撞色微调）
 * ========================================================================= */
/* =========================================================================
 * 🌟 爱丽丝家族【高级白金/浅金系列】（带全量容错与兜底）
 * ========================================================================= */
/* 0. 兜底保障：只要含有“爱丽丝”均先赋予纯澈月光白金（防止任何情况掉色） */
div.custom-nvn-dialogue[data-char*="爱丽丝"] { 
  --main: #f2d680 !important; 
  --sub: #fffdf5 !important; 
  --rgb: 242, 214, 128 !important; 
  --motion-color: #fae7a8 !important; 
}

/* 1. 女儿爱丽丝：初曦纯澈浅金（明亮、通透白金） */
div.custom-nvn-dialogue:is([data-char*="女儿爱丽丝"], [data-char*="女儿"], [data-char*="爱丽丝（女"], [data-char*="爱丽丝(女"]) { 
  --main: #fae188 !important; 
  --sub: #fffee8 !important; 
  --rgb: 250, 225, 136 !important; 
  --motion-color: #fcf0ba !important; 
}

/* 2. 妈妈/母亲爱丽丝：柔霜香槟白金（典雅高级，绝不暗沉发黄） */
div.custom-nvn-dialogue:is([data-char*="母亲爱丽丝"], [data-char*="妈妈爱丽丝"], [data-char*="妈妈"], [data-char*="母亲"]) { 
  --main: #e8d39b !important; 
  --sub: #fbf7ee !important; 
  --rgb: 232, 211, 155 !important; 
  --motion-color: #f2e4bf !important; 
}

/* 3. 妹妹爱丽丝：微粉晨曦柔金（甜润浅白金） */
div.custom-nvn-dialogue:is([data-char*="妹妹爱丽丝"], [data-char*="妹妹"]) { 
  --main: #eed19c !important; 
  --sub: #fdf8ee !important; 
  --rgb: 238, 209, 156 !important; 
  --motion-color: #f5e2bf !important; 
}

/* 4. 爱丽丝·利德尔：纯澈月光白金 */
div.custom-nvn-dialogue:is([data-char*="爱丽丝·利德尔"], [data-char*="利德尔次女"]) { 
  --main: #f2d680 !important; 
  --sub: #fffdf5 !important; 
  --rgb: 242, 214, 128 !important; 
  --motion-color: #fae7a8 !important; 
}

/* 5. 人偶爱丽丝：冷雾银白金 */
div.custom-nvn-dialogue:is([data-char*="人偶爱丽丝"], [data-char*="02-D"]) { 
  --main: #dcd3be !important; 
  --sub: #f6f3eb !important; 
  --rgb: 220, 211, 190 !important; 
  --motion-color: #eae5d7 !important; 
}
div.custom-nvn-dialogue[data-char*="蛇神"] { --main: #d4af37 !important; --sub: #f9f4de !important; --rgb: 212, 175, 55 !important; --motion-color: #e0c567 !important; } /* 辉耀流金 */

/* 指定指定色系 */
div.custom-nvn-dialogue[data-char*="诺登"] { --main: #d3d7de !important; --sub: #f5f7fa !important; --rgb: 211, 215, 222 !important; --motion-color: #e0e4eb !important; } /* 冷月纯银 */
div.custom-nvn-dialogue[data-char*="小红帽"] { --main: #d63031 !important; --sub: #fadbd8 !important; --rgb: 214, 48, 49 !important; --motion-color: #e15f60 !important; } /* 猩红斗篷 */
div.custom-nvn-dialogue[data-char*="普利凯特"] { --main: #f08080 !important; --sub: #fde8e8 !important; --rgb: 240, 128, 128 !important; --motion-color: #f4a2a2 !important; } /* 珊瑚淡红 */
div.custom-nvn-dialogue[data-char*="梅贝尔"] { --main: #8589ff !important; --sub: #f0f1ff !important; --rgb: 133, 137, 255 !important; --motion-color: #a8abff !important; } /* 梦幻蓝紫 */
div.custom-nvn-dialogue:is([data-char*="玛丽·安"], [data-char*="莉耶芙"]) { --main: #2ed573 !important; --sub: #e0f9ec !important; --rgb: 46, 213, 115 !important; --motion-color: #65e199 !important; } /* 翠草清绿 */
div.custom-nvn-dialogue[data-char*="柴郡猫"] { --main: #c39bd3 !important; --sub: #f5eef8 !important; --rgb: 195, 155, 211 !important; --motion-color: #d4b4e0 !important; } /* 梦幻淡紫 */

/* 其余立绘专属提取配色 */
div.custom-nvn-dialogue[data-char*="公爵夫人"] { --main: #e67e22 !important; --sub: #fdf2e9 !important; --rgb: 230, 126, 34 !important; --motion-color: #f0a35e !important; } /* 暖橘发色 */
div.custom-nvn-dialogue[data-char*="帽子屋"] { --main: #7f8c8d !important; --sub: #f2f4f4 !important; --rgb: 127, 140, 141 !important; --motion-color: #a4afb0 !important; } /* 礼帽烟灰 */
div.custom-nvn-dialogue[data-char*="三月兔"] { --main: #e84393 !important; --sub: #fde8f2 !important; --rgb: 232, 67, 147 !important; --motion-color: #ee72ae !important; } /* 狂气粉红 */
div.custom-nvn-dialogue[data-char*="格里菲"] { --main: #e59866 !important; --sub: #fbf0e8 !important; --rgb: 229, 152, 102 !important; --motion-color: #ebb692 !important; } /* 狮鹫羽金 */
div.custom-nvn-dialogue[data-char*="假海龟"] { --main: #48c9b0 !important; --sub: #e8f8f5 !important; --rgb: 72, 201, 176 !important; --motion-color: #79d8c4 !important; } /* 苍青海色 */
div.custom-nvn-dialogue[data-char*="渡渡"] { --main: #bcaaa4 !important; --sub: #f5f2f1 !important; --rgb: 188, 170, 164 !important; --motion-color: #d0c2bd !important; } /* 灰褐羽色 */
div.custom-nvn-dialogue[data-char*="希夏"] { --main: #a3cb38 !important; --sub: #f4f9e8 !important; --rgb: 163, 203, 56 !important; --motion-color: #bfdc6f !important; } /* 青虫翠黄 */
div.custom-nvn-dialogue[data-char*="比尔"] { --main: #829f82 !important; --sub: #edf2ed !important; --rgb: 130, 159, 130 !important; --motion-color: #a4bda4 !important; } /* 苍绿蜥蜴 */
div.custom-nvn-dialogue[data-char*="维多利雅"] { --main: #f78fb3 !important; --sub: #fef0f4 !important; --rgb: 247, 143, 179 !important; --motion-color: #f9abc4 !important; } /* 樱粉女仆 */
div.custom-nvn-dialogue[data-char*="弗洛伦斯"] { --main: #34495e !important; --sub: #ebedef !important; --rgb: 52, 73, 94 !important; --motion-color: #61778c !important; } /* 铁牢深蓝 */
div.custom-nvn-dialogue[data-char*="罗丽娜"] { --main: #2c3e50 !important; --sub: #d0d7de !important; --rgb: 44, 62, 80 !important; --motion-color: #5d6d7e !important; } /* 暗夜黑鸦 */
div.custom-nvn-dialogue[data-char*="格尔达"] { --main: #d5dbdb !important; --sub: #f8f9f9 !important; --rgb: 213, 219, 219 !important; --motion-color: #e3e8e8 !important; } /* 白雪绒帽 */
div.custom-nvn-dialogue[data-char*="尤妮丝"] { --main: #dcdde1 !important; --sub: #ffffff !important; --rgb: 220, 221, 225 !important; --motion-color: #ececec !important; } /* 独角兽雪白 */
div.custom-nvn-dialogue[data-char*="莱登"] { --main: #bdc3c7 !important; --sub: #f4f6f7 !important; --rgb: 189, 195, 199 !important; --motion-color: #d2d7d9 !important; } /* 苍白毛皮 */
div.custom-nvn-dialogue[data-char*="克缇"] { --main: #74b9ff !important; --sub: #eaf3fe !important; --rgb: 116, 185, 255 !important; --motion-color: #9eccff !important; } /* 水母荧蓝 */
div.custom-nvn-dialogue[data-char*="贾巴沃克"] { --main: #57606f !important; --sub: #e2e4e7 !important; --rgb: 87, 96, 111 !important; --motion-color: #7d8694 !important; } /* 异界骨灰 */
div.custom-nvn-dialogue[data-char*="贾布加布"] { --main: #718093 !important; --sub: #e8ecf1 !important; --rgb: 113, 128, 147 !important; --motion-color: #929eaec !important; } /* 异鸟苍羽 */
div.custom-nvn-dialogue[data-char*="班达斯奈奇"] { --main: #8854d0 !important; --sub: #efe8fa !important; --rgb: 136, 84, 208 !important; --motion-color: #a77ee0 !important; } /* 猩狞绛紫 */
div.custom-nvn-dialogue[data-char*="希伏契"] { --main: #d980fa !important; --sub: #faedf7 !important; --rgb: 217, 128, 250 !important; --motion-color: #e3a2fb !important; } /* 幻惑淡粉紫 */
div.custom-nvn-dialogue[data-char*="崔德尔·蒂"] { --main: #95a5a6 !important; --sub: #eff2f2 !important; --rgb: 149, 165, 166 !important; --motion-color: #b3c0c1 !important; } /* 绷带冷灰 */
div.custom-nvn-dialogue[data-char*="崔德尔·达姆"] { --main: #7f8c8d !important; --sub: #eff1f1 !important; --rgb: 127, 140, 141 !important; --motion-color: #a4afb0 !important; } /* 绷带深灰 */
div.custom-nvn-dialogue[data-char*="雏鸟"] { --main: #f5cd79 !important; --sub: #fef7e9 !important; --rgb: 245, 205, 121 !important; --motion-color: #f8dba0 !important; } /* 蛋壳浅鹅黄 */

/* =========================================================================
 * 🖼️ 新增角色头像直链映射（含同义词绑定与共用图）
 * ========================================================================= */
div.custom-nvn-dialogue[data-char*="爱丽丝·利德尔"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/08/fb26cbb7d5caf2b3e5bb006a54de0875c04384eb7c62cad1.png") !important; }
div.custom-nvn-dialogue:is([data-char*="母亲爱丽丝"], [data-char*="妈妈爱丽丝"]) .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/08/097e2ebda0c4b078383c2b19c4920bde1cc4125f756ef6aa.png") !important; }
div.custom-nvn-dialogue:is([data-char*="女儿爱丽丝"], [data-char*="女儿"]) .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/08/89da196c1fb9669196f2ad9a6a09ec2abf29e85dad0da0fb.png") !important; }
div.custom-nvn-dialogue[data-char*="妹妹爱丽丝"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/08/3c41af5f604c2bb1ed68f6662853c44b4f8dc8105575bad6.png") !important; }
div.custom-nvn-dialogue[data-char*="人偶爱丽丝"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/08/02-D14585590e6b7f795.png") !important; }
div.custom-nvn-dialogue[data-char*="蛇神"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/08/3bbc05b5fd9c50bfb6aedabd8561913e6dc51bf2e531d8b4.png") !important; }

div.custom-nvn-dialogue[data-char*="诺登"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/08/77f0ce219f648a571427e5714d58240e54bdb2d9dc32d2e5.png") !important; }
div.custom-nvn-dialogue[data-char*="小红帽"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/08/1c4eb4a13f11a987104f66f37bd94d8546f22fe9308e15e5.png") !important; }
div.custom-nvn-dialogue[data-char*="普利凯特"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/08/ca56c10823d6dfc4a27c94ba4ea9c4511cc8a6f6aee686b3.png") !important; }
div.custom-nvn-dialogue[data-char*="梅贝尔"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/08/27f90d0f6f0497d00bb1ceaf8115284e1b66c644216537c3.png") !important; }

/* 玛丽·安与莉耶芙共用一个链接 */
div.custom-nvn-dialogue:is([data-char*="玛丽·安"], [data-char*="莉耶芙"]) .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/08/68208d56a291c30f7e89bc8a5fa6fd13e1aed1c696238752.png") !important; }

div.custom-nvn-dialogue[data-char*="公爵夫人"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/08/1216129b006b0afd1bf774045f3a143ed3455d4fb36660c9.png") !important; }
div.custom-nvn-dialogue[data-char*="帽子屋"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/08/1ba5573147239aa7c55e7cbb16c7ca25e371d8726a04a2d4.png") !important; }
div.custom-nvn-dialogue[data-char*="三月兔"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/08/791905c560e833185bf5c86d2893563cdf5f75d6f095945b.png") !important; }
div.custom-nvn-dialogue[data-char*="格里菲"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/08/e8d44a1d9f39317ce599d94299e3d4709d247b246f960cc2.png") !important; }
div.custom-nvn-dialogue[data-char*="假海龟"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/08/efc9a1ed037ff82ca2cae7188a1ed873e0d8eaa07203b795.png") !important; }
div.custom-nvn-dialogue[data-char*="渡渡"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/08/01c652f6295aa9d879b6edc78d15a1bc3a07d8a19355fe81.png") !important; }
div.custom-nvn-dialogue[data-char*="希夏"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/08/bc529f3bf9e2cc322fae41d8f235a6e038b0d5ffecc7d679.png") !important; }
div.custom-nvn-dialogue[data-char*="比尔"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/08/0444efc5eee28f540afbf6192ae23264dbf5299a7b84d651.png") !important; }
div.custom-nvn-dialogue[data-char*="维多利雅"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/08/c27572a47de3e01fb4a5455d537b355543c4223c9185e464.png") !important; }
div.custom-nvn-dialogue[data-char*="弗洛伦斯"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/08/547364de2221410a5d2c60f321a4b3c0e390f8fd861e5ad3.png") !important; }
div.custom-nvn-dialogue[data-char*="罗丽娜"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/08/b997d7fef52e6eee76c4425bc3c78faf0a4b42391dc02b30.png") !important; }
div.custom-nvn-dialogue[data-char*="格尔达"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/08/3ac5fe98a76ed9b7f07baae999747a86d28860c6dbc6fffd.png") !important; }
div.custom-nvn-dialogue[data-char*="尤妮丝"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/08/ff8a0b04f4731b352285cd8c0ba4269ef74975a52f838548.png") !important; }
div.custom-nvn-dialogue[data-char*="莱登"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/08/38a4e9c4e0eb78bc673b4181afe01519ef722fc246ed5d7f.png") !important; }
div.custom-nvn-dialogue[data-char*="克缇"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/08/ff1ee1b191655fb8c9aa04f6d09f76a9f62bddd5931366d9.png") !important; }
div.custom-nvn-dialogue[data-char*="贾巴沃克"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/08/b56e15e3dcdeb6d688ba47bd419fd6a8fc438b7af1e6396e.png") !important; }
div.custom-nvn-dialogue[data-char*="贾布加布"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/08/a46701cee939312d7f011f77864237383716913e0874e75e.png") !important; }
div.custom-nvn-dialogue[data-char*="班达斯奈奇"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/08/d366140eb2de17f66eabdfa7b8989a126df38d4017c34ae9.png") !important; }
div.custom-nvn-dialogue[data-char*="希伏契"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/08/a6adcbd2dbec8fc9de3e6da4f4e5d708994c0f743539c7c1.png") !important; }
div.custom-nvn-dialogue[data-char*="柴郡猫"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/08/10b332bf0cf41232d9ede85ed4d0993927a335b40acf9b6b.png") !important; }
div.custom-nvn-dialogue[data-char*="崔德尔·蒂"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/08/1c4970974e4d8539449cd885faa450aff250a6732dc135dc.png") !important; }
div.custom-nvn-dialogue[data-char*="崔德尔·达姆"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/08/184a570189a0a08fbaaf3869debd0ab87efbb67d0ad87da4.png") !important; }
div.custom-nvn-dialogue[data-char*="雏鸟"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/08/bcd2a8cd2f373febdf12a9bf714a74b0f4a1b4bda6becd1c.png") !important; }

/* 单图角色 */
div.custom-nvn-dialogue:is([data-char*="凯埃尔"], [data-char*="卡伊埃尔"]) .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/02667b3c75d750d735ccf39b458b59e44df3c52454f35dd9.png") !important; }
div.custom-nvn-dialogue[data-char*="露娜"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/22706d19f51532c81.png") !important; }
div.custom-nvn-dialogue[data-char*="桑尼"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/a1053a15a247fce3f550d7bded6046c67cc23cbe47716f0a.png") !important; }
div.custom-nvn-dialogue[data-char*="萨菲亚"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/1e71ebd4a7e3712ee09e6eab8cbc9cd2eeb8e7dfed68f836.png") !important; }
[data-char*="菲娅"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/19/8bd536a22ff04e798acce03d2331ef5d4a6c08d85dccef06.png") !important; }
div.custom-nvn-dialogue[data-char*="拉菲莉娅"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/eb8b2e9da49acde3a0c1317b0955027b23ebb331418be102.png") !important; }
div.custom-nvn-dialogue[data-char*="赛蕾姆丝"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/6d5ab923b636763c7398d33755ccaeb6b57a6fa8d0dd10c7.png") !important; }
div.custom-nvn-dialogue[data-char*="斯雅"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/26/4d26a6b4ad5b72c59bdbfc9acf8b79988691d20c23dcfea7.png") !important; }
div.custom-nvn-dialogue[data-char*="雷克西斯"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/80e258a6d9acd96271df8fe07bb10f678e01d1827dada321.png") !important; }
div.custom-nvn-dialogue[data-char*="小春"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/9c29c6d29af5d31e6b48e46ed1cffad77a6c029ca66ed4e9.png") !important; }
div.custom-nvn-dialogue[data-char*="五月雨"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/73accf3be7605e89f3761656f72183e225fe340d23ced5b5.png") !important; }
div.custom-nvn-dialogue[data-char*="大王"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/70613f9cd926eb9df8dc022f17ca61912aeb9c2553cd6916.png") !important; }
div.custom-nvn-dialogue[data-char*="芙萝"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/d42bc6bfe30dc9fba9f0bb3b72b0d96430c5e4eda1959dd9.png") !important; }
div.custom-nvn-dialogue[data-char*="艾珀尔"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/678582aa9b9eaa9a413b09fad59bf58ace7ed9acb8bc71e5.png") !important; }
div.custom-nvn-dialogue[data-char*="芙洛瑞丝"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/98a89e9e1c99d3180fc2145b6d31506fea73cc00947be8c7.png") !important; }
div.custom-nvn-dialogue[data-char*="布娜"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/b92aa349890498ace7f37b15df6a7b0617cbd18ed4d9ffdc.png") !important; }
div.custom-nvn-dialogue[data-char*="幽妮娅"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/a98c931c39917d2e6805d548362ec83e0416053184ba36d5.png") !important; }
div.custom-nvn-dialogue[data-char*="塞伊"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/8e62b282f44ee645991192a03528683c5ffe336fdd2a15e7.png") !important; }
div.custom-nvn-dialogue[data-char*="利奥"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/629723423085ca2f84dec0fb44b157ec7246078acec59370.png") !important; }


/* =========================================================================
 * 🎭 表情差分映射完整配置
 * ========================================================================= */
/* --- 克蕾雅 --- */
[data-char*="克蕾雅"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/1409d4e13ab7c1ad7e96924a36bdd9a3482303ab0ef221c1.png") !important; }
[data-char*="克蕾雅"][data-action*="脸红"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/fc2183f6475eb6ee573dd4db16b3ec9f48c2cb75b49e78e4.png") !important; }
[data-char*="克蕾雅"][data-action="通常"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/1409d4e13ab7c1ad7e96924a36bdd9a3482303ab0ef221c1.png") !important; }
[data-char*="克蕾雅"][data-action="脸红通常"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/fc2183f6475eb6ee573dd4db16b3ec9f48c2cb75b49e78e4.png") !important; }
[data-char*="克蕾雅"][data-action="得意"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/1f27d649bd5f1a9ddb35bfefea4ed3f04683fd73356f1699.png") !important; }
[data-char*="克蕾雅"][data-action="脸红得意"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/bc29db1fa53036376ad890acbf993fda57275798edb08f16.png") !important; }
[data-char*="克蕾雅"][data-action="腹黑笑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/5f4e05c1af887f84f81b6389692ef9af103738822016d420.png") !important; }
[data-char*="克蕾雅"][data-action="脸红腹黑笑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/2d53ef3ea50d7e218f439e2fac5683be6c93ddb9aacfbb81.png") !important; }
[data-char*="克蕾雅"][data-action="害羞"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/68033e2d6a21b8051c9508ff0755bddbed247c407040b4bb.png") !important; }
[data-char*="克蕾雅"][data-action="惊讶"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/7794ef980f5bc34e787a3995b6b0b4b7745084898eb659ed.png") !important; }
[data-char*="克蕾雅"][data-action="脸红惊讶"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/baa11b8602a9f6449cf68eed348d25580c136419c3adba4f.png") !important; }
[data-char*="克蕾雅"][data-action="高兴"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/d8a041121401ef923bac3be73db4bf7b0d8a40a14a7ca628.png") !important; }
[data-char*="克蕾雅"][data-action="脸红高兴"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/57581a2f8d7520b05fc6b4faac3a7d06100aa17811a87dd5.png") !important; }
[data-char*="克蕾雅"][data-action="难过"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/f65ef8265d29273d9253d211fc1e1e1fb7179c9a6778d8b2.png") !important; }
[data-char*="克蕾雅"][data-action="脸红难过"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/3befe4267924d76dbc662ecae1807ed7f63377ed996d0970.png") !important; }
[data-char*="克蕾雅"][data-action="疑惑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/b0b4fdd77f7292caf2f58b6edff0f66b237500ffb5fb3610.png") !important; }
[data-char*="克蕾雅"][data-action="脸红疑惑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/f03cbb5d81bb016bac835a74dfd51176f02cbb804c65fe98.png") !important; }
[data-char*="克蕾雅"][data-action="生气"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/3b2308cdc7cf17a9cbdcc5e19940c31ec7d54698b268f4f5.png") !important; }
[data-char*="克蕾雅"][data-action="脸红生气"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/44ce1289e408ff31326c15854d2dd52400d534ac1dcbd11f.png") !important; }
[data-char*="克蕾雅"][data-action="皱眉"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/2a1abab328580412da62f64cc99df487554518f75d7f6560.png") !important; }
[data-char*="克蕾雅"][data-action="脸红皱眉"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/c1f238456163127c71dad05c1ff273da1cf2136d8b8580ee.png") !important; }
[data-char*="克蕾雅"][data-action="思考"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/d0e17c88434483f1d7a56d38338f6d23aea4606b985fee04.png") !important; }
[data-char*="克蕾雅"][data-action="脸红思考"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/c9a1f8b8fc602d1a851b83c15311e7b05e5f33868d44dde8.png") !important; }

/* --- 伊莉丝 --- */
[data-char*="伊莉丝"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/19/2d1f3a9410fb102694138c3814c6eea58e488a9222034f2f.png") !important; }
[data-char*="伊莉丝"][data-action*="脸红"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/19/4689bd9b3deca1a625816f59a28a6ffa733ef33534f9c072.png") !important; }
[data-char*="伊莉丝"][data-action="通常"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/19/34615f5ddf9e4653b.png") !important; }
[data-char*="伊莉丝"][data-action="脸红通常"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/19/35c2596b5b45e7c2e.png") !important; }
[data-char*="伊莉丝"][data-action="得意"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/19/bf1e5e544b378ff2803074f4b48ca40c02cc02bf6f2931f1.png") !important; }
[data-char*="伊莉丝"][data-action="脸红得意"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/19/1301eb18fd535af029aa49ddf78d6ae98dec947fa655c20f.png") !important; }
[data-char*="伊莉丝"][data-action="腹黑笑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/19/07e978464cc11b95b74679c3d8f4fb49945af2d2f3833cb0.png") !important; }
[data-char*="伊莉丝"][data-action="脸红腹黑笑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/19/a0b7dd4135fee73211b096c4f9070d3f15829f334e3078f5.png") !important; }
[data-char*="伊莉丝"][data-action="害羞"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/19/e50b93e9f8d79e3c5eafe22fe628864448f956ba1782eb2e.png") !important; }
[data-char*="伊莉丝"][data-action="惊讶"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/19/bd06e19e9c2ef9eb9339a66cdef14edc45a6c214456bd89c.png") !important; }
[data-char*="伊莉丝"][data-action="脸红惊讶"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/19/15f4cf6e1d512b52af3e568ab1a666c2b7fbac8b6f730d85.png") !important; }
[data-char*="伊莉丝"][data-action="高兴"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/19/4bd0ed4b90feb9392fcbe3ae9f9c811fb9014bfc1bd6448b.png") !important; }
[data-char*="伊莉丝"][data-action="脸红高兴"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/19/5cb1c6594c9ff9a88671c706b8209bf10cbfcf21be29210d.png") !important; }
[data-char*="伊莉丝"][data-action="难过"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/19/7fa8e7d4d2304a6c0caf6ed4b54151c4a1953c266fe98029.png") !important; }
[data-char*="伊莉丝"][data-action="脸红难过"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/19/bad5379dd4f6693a19ae015491a7038c210b5d18ea400440.png") !important; }
[data-char*="伊莉丝"][data-action="疑惑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/19/288f8338059e8b87bb25309c732e1a1198ad3cfe3d8c3fa6.png") !important; }
[data-char*="伊莉丝"][data-action="脸红疑惑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/19/8ce72aa99400e79a2213a21b1e998e304d09accb1466081f.png") !important; }
[data-char*="伊莉丝"][data-action="生气"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/19/81523adb94e0e465337e9d8f972f5d858e6dbb6f0e8e6ff0.png") !important; }
[data-char*="伊莉丝"][data-action="脸红生气"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/19/9bd4d9a1afdd75612e8bbf13988dc542f9f18a2a42c2e651.png") !important; }
[data-char*="伊莉丝"][data-action="皱眉"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/19/8e3ee4cc4ab643bc29d5a6da695f8b487dae91bc28e8af96.png") !important; }
[data-char*="伊莉丝"][data-action="脸红皱眉"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/19/fd3a8c132004572e04a300524b489866393e9f8995f567de.png") !important; }
[data-char*="伊莉丝"][data-action="思考"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/19/54bca66d23f55859a3b59f732941cbcb56ed53e6a76a7ed7.png") !important; }
[data-char*="伊莉丝"][data-action="脸红思考"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/19/e88187549e11bef5b0eb6893605d51d49d5349ecfb821311.png") !important; }

/* --- 丽塔 --- */
[data-char*="丽塔"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/19/47add4de39d9d3d7f8aeee6228c46f8453aa07b8239428b3.png") !important; }
[data-char*="丽塔"][data-action*="脸红"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/19/6d033264a424686c6a2b5338bfd17fbda4bb18cd74ba0691.png") !important; }
[data-char*="丽塔"][data-action="通常"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/19/47add4de39d9d3d7f8aeee6228c46f8453aa07b8239428b3.png") !important; }
[data-char*="丽塔"][data-action="脸红通常"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/19/6d033264a424686c6a2b5338bfd17fbda4bb18cd74ba0691.png") !important; }
[data-char*="丽塔"][data-action="得意"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/19/c5fde236c8c7be783ea6450c38b41382edeb6192fa8679c7.png") !important; }
[data-char*="丽塔"][data-action="脸红得意"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/19/5467ae0083cedd3ee6770cd162d7af4826f988b7ae51c073.png") !important; }
[data-char*="丽塔"][data-action="腹黑笑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/19/dfa3289f7fc5fbb2454f0c5662a90ade49ceea085a03b395.png") !important; }
[data-char*="丽塔"][data-action="脸红腹黑笑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/19/d4505e88420bf9a8a429010c990a47e8b9e67d09e855c743.png") !important; }
[data-char*="丽塔"][data-action="害羞"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/19/095bbd75ad7acf33c306be24164dde89068f728baa17d681.png") !important; }
[data-char*="丽塔"][data-action="惊讶"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/19/125c12b59d1dda9887d6b2e75697c81b22152ff82e82eeb5.png") !important; }
[data-char*="丽塔"][data-action="脸红惊讶"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/19/6a478e37757af13f4a0b4477b3af8d2988bcb99651965005.png") !important; }
[data-char*="丽塔"][data-action="高兴"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/19/18cca123f05c53a2f084dc19c6468ef430da4d7fe4c6ac7d.png") !important; }
[data-char*="丽塔"][data-action="脸红高兴"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/19/8de9e1926bd12bcf32cb3eec058b7039c4b9127e1026175e.png") !important; }
[data-char*="丽塔"][data-action="难过"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/19/0ccfa301e20560eb02a9720e5ee967d724bc21039ea569ff.png") !important; }
[data-char*="丽塔"][data-action="脸红难过"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/19/-1777fcbb8f0962a89.png") !important; }
[data-char*="丽塔"][data-action="疑惑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/19/dcf1d5b1f709c5b9bbfafe4c944b2fab345ce755c1de2a70.png") !important; }
[data-char*="丽塔"][data-action="脸红疑惑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/19/4ef60f1e5f6447f16a56e9e68e91ef13e1c25569197c8af7.png") !important; }
[data-char*="丽塔"][data-action="生气"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/19/4e558241b5ccf3b6e1e6a1eacb63095de1df0eb96ca02631.png") !important; }
[data-char*="丽塔"][data-action="脸红生气"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/19/a899ce12c9b53722d1aff1ecfcb5ecccd5f3e46fa3acba84.png") !important; }
[data-char*="丽塔"][data-action="皱眉"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/19/559a06130b8885bb1e68c0add3c40cccf9db00a4df920f10.png") !important; }
[data-char*="丽塔"][data-action="脸红皱眉"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/19/2a6682eaae5f565b288f14f76ca72b55a48c7e911773f49f.png") !important; }
[data-char*="丽塔"][data-action="思考"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/19/f519fa6632f26500c804b94289ba16d13b34533cc9ae5b01.png") !important; }
[data-char*="丽塔"][data-action="脸红思考"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/19/-1dcf99e2b159f9244.png") !important; }

/* --- 阿黛拉 --- */
[data-char*="阿黛拉"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/8960482acfee34f1120a7e040e65b7ba8ea28a72c3e3e1c4.png") !important; }
[data-char*="阿黛拉"][data-action*="脸红"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/665bf599d73b460e42def7abc9a4447ea947cc1da5f83855.png") !important; }
[data-char*="阿黛拉"][data-action="通常"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/8960482acfee34f1120a7e040e65b7ba8ea28a72c3e3e1c4.png") !important; }
[data-char*="阿黛拉"][data-action="脸红通常"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/665bf599d73b460e42def7abc9a4447ea947cc1da5f83855.png") !important; }
[data-char*="阿黛拉"][data-action="得意"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/7f67009dc9a0a4b6a42a4450612b4fca4019a9cce4c515bc.png") !important; }
[data-char*="阿黛拉"][data-action="脸红得意"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/513eb8b2086e68cde091f4aea6f7f66d71b039300e9ed2cd.png") !important; }
[data-char*="阿黛拉"][data-action="腹黑笑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/bc20e6fa0d3b89fe11c5872b9608621dbeea0663f06bd343.png") !important; }
[data-char*="阿黛拉"][data-action="脸红腹黑笑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/786949f552dbc4febc4ba2d852f47e4cd1cb2e26402ea4e2.png") !important; }
[data-char*="阿黛拉"][data-action="害羞"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/5cd500e3d05b215bc0b2444eaf91fbd83d3f67beaf841ae3.png") !important; }
[data-char*="阿黛拉"][data-action="惊讶"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/12e43e66df59e65723e6c343508516930bcd9003e59948e3.png") !important; }
[data-char*="阿黛拉"][data-action="脸红惊讶"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/54beacaf9cb7504ebbd2178fad8ed7a6712f7eed4fba8764.png") !important; }
[data-char*="阿黛拉"][data-action="高兴"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/79fd7c28e4381469b559e36287704b3cd6e47a4bd1bde584.png") !important; }
[data-char*="阿黛拉"][data-action="脸红高兴"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/a90a7d5dd55b22365bf4fa074c97f1148f42a47dc87ae641.png") !important; }
[data-char*="阿黛拉"][data-action="难过"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/cb141b0da54e1c150db0da8a8aff3ac9d1480675c4952b7e.png") !important; }
[data-char*="阿黛拉"][data-action="脸红难过"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/5426bb77aae3fe6e179c94ea81c91abb20d5b1b3520b6c9a.png") !important; }
[data-char*="阿黛拉"][data-action="疑惑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/63d348cae62e7c771b2f77574913b75164b5b0d58bd1a048.png") !important; }
[data-char*="阿黛拉"][data-action="脸红疑惑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/52b07fc182d9be002bb498256fd296e338176dde4cc7959f.png") !important; }
[data-char*="阿黛拉"][data-action="生气"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/fde55a1951c49b181efb5057337a677c5d7ba0d0c83c45cc.png") !important; }
[data-char*="阿黛拉"][data-action="脸红生气"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/21dd76135ae3f43151678f0c79734ee7fc36bbe6cd642fd3.png") !important; }
[data-char*="阿黛拉"][data-action="皱眉"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/9d7862ea27d91e2ab62272841fa47bf7b44a9628681cc6fa.png") !important; }
[data-char*="阿黛拉"][data-action="脸红皱眉"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/a98e1b42aedefe0ff1a5907fb049cf3cb6e03fe95fecee82.png") !important; }
[data-char*="阿黛拉"][data-action="思考"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/c99e8527594d38bd42d10b72528fb2a053ab7b5d24e16b28.png") !important; }
[data-char*="阿黛拉"][data-action="脸红思考"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/5c21f0d6cdc524af194a40f343025388fbf55e0f6aceba73.png") !important; }

/* --- 梅拉 --- */
[data-char*="梅拉"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/31f3ea8ecb0364f11784be1d0e50200bb3a6ea2667f58b02.png") !important; }
[data-char*="梅拉"][data-action*="脸红"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/100159557a2e55589a4fc286ec0dd189ddc7e2534f145055.png") !important; }
[data-char*="梅拉"][data-action="通常"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/31f3ea8ecb0364f11784be1d0e50200bb3a6ea2667f58b02.png") !important; }
[data-char*="梅拉"][data-action="脸红通常"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/100159557a2e55589a4fc286ec0dd189ddc7e2534f145055.png") !important; }
[data-char*="梅拉"][data-action="得意"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/ae395e8eb5a2238089054c807786f6192739b63e6ef1bdff.png") !important; }
[data-char*="梅拉"][data-action="脸红得意"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/738d7831ddb6e76670293caa9a88c6d079679a1fb66eca30.png") !important; }
[data-char*="梅拉"][data-action="腹黑笑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/fa3dfeb86c123ad01d84319586fcafb44c2e2d868a3ba85b.png") !important; }
[data-char*="梅拉"][data-action="脸红腹黑笑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/ea41b6c7f09b8650927147c895b7294a461996d4a2d7de8f.png") !important; }
[data-char*="梅拉"][data-action="害羞"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/4742561e08ebf9cbb99c0795303f3979e7e13b6770b9ba52.png") !important; }
[data-char*="梅拉"][data-action="惊讶"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/c5fd5fa754fc065c2c4d9b67051dc892b72920f072458be2.png") !important; }
[data-char*="梅拉"][data-action="脸红惊讶"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/7fcd9a29eb0fecba48facf9bc470b986175712e05ffcce10.png") !important; }
[data-char*="梅拉"][data-action="高兴"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/96d76ef5ca7645fc29b2691251eaf2a6dbea0a3d73f19c6c.png") !important; }
[data-char*="梅拉"][data-action="脸红高兴"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/b16cd17c94a9368ad3dfb3dac20439aa8f8ce5275fb6fd7d.png") !important; }
[data-char*="梅拉"][data-action="难过"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/9d71829728a30069411798cbe849eba90e9be1e9d12bfe39.png") !important; }
[data-char*="梅拉"][data-action="脸红难过"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/c52a6b3babb88e053e6163da0b0d864bacefb98cc4827b92.png") !important; }
[data-char*="梅拉"][data-action="疑惑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/79e75a569914fd4678426a3a1cb1db1d9afbbfa353eb78be.png") !important; }
[data-char*="梅拉"][data-action="脸红疑惑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/740df39c6a2e9da1e81954472aadb93061d589f2bb0e6b57.png") !important; }
[data-char*="梅拉"][data-action="生气"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/82ec6b22c2555527db97de9baac3de0628ccfc64e53d9d14.png") !important; }
[data-char*="梅拉"][data-action="脸红生气"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/cd6a6a517c9cb2008efbc1f425bac7c2a3019d91f5067592.png") !important; }
[data-char*="梅拉"][data-action="皱眉"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/364add85ce583254de200ce119dcd738068d6aae01a4adc6.png") !important; }
[data-char*="梅拉"][data-action="脸红皱眉"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/e526b5782639d64a5f09843b67a29fd9522b7d962214e7fc.png") !important; }
[data-char*="梅拉"][data-action="思考"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/905f0f40a56760b7f44aadf067bdd6d80b7d061b02ea0741.png") !important; }
[data-char*="梅拉"][data-action="脸红思考"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/6112acdb0158fe22762f891845ae9772793b1ef7067e5252.png") !important; }

/* --- 莉莉 --- */
[data-char*="莉莉娅"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/1b3aaf46fcec72dd5b23d8ecd9092f3b0f41accba6f103d6.png") !important; }
[data-char*="莉莉娅"][data-action*="脸红"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/a7636a238de8d81418337b0d1df2618e301d240b5c61ffbd.png") !important; }
[data-char*="莉莉娅"][data-action="通常"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/1b3aaf46fcec72dd5b23d8ecd9092f3b0f41accba6f103d6.png") !important; }
[data-char*="莉莉娅"][data-action="脸红通常"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/a7636a238de8d81418337b0d1df2618e301d240b5c61ffbd.png") !important; }
[data-char*="莉莉娅"][data-action="得意"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/3138860658141946831e677f2093e7afed7bdfd217c05d9d.png") !important; }
[data-char*="莉莉娅"][data-action="脸红得意"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/e1330533b0b523fb7814683fc0999557c0b1c1e740f3481e.png") !important; }
[data-char*="莉莉娅"][data-action="腹黑笑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/6ce53dc214b98e71f7f256c98b93b9b71151a88f9d182eba.png") !important; }
[data-char*="莉莉娅"][data-action="脸红腹黑笑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/671d28be8f9f3ed6c4f82a25efe9da10f16f6b79785205b9.png") !important; }
[data-char*="莉莉娅"][data-action="害羞"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/c6c396f3a649c77f17cfc46857ba894009c4649cc9f51f2d.png") !important; }
[data-char*="莉莉娅"][data-action="惊讶"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/027dfb0a620e8912c0249e4032090a62c129ae0c1f408888.png") !important; }
[data-char*="莉莉娅"][data-action="脸红惊讶"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/edd003d06bb444976ece5673b7eb43ba1fec1ac47034c75f.png") !important; }
[data-char*="莉莉娅"][data-action="高兴"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/34f60ea0e5516e75e625c681dc525e1431d3a34d880a5a2d.png") !important; }
[data-char*="莉莉娅"][data-action="脸红高兴"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/9facb2467e155cb9541786f9e8e7bc787f1f439e30c1592b.png") !important; }
[data-char*="莉莉娅"][data-action="难过"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/90d700fd5a93c1f12710a3b65ef0966edd3e956f1be1b0b6.png") !important; }
[data-char*="莉莉娅"][data-action="脸红难过"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/27d21c28fb65babfbaf79cf034d9a74af4c73aa1498094ee.png") !important; }
[data-char*="莉莉娅"][data-action="疑惑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/d00661b9329e74d570cf2b98c8cb102dda0334e3541c7660.png") !important; }
[data-char*="莉莉娅"][data-action="脸红疑惑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/e2a1404c93542c47590d06399aa769ae593051cbb9f65f1f.png") !important; }
[data-char*="莉莉娅"][data-action="生气"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/c8969fb6484869e36dc15ba513874e036eb4b8965b51b4e8.png") !important; }
[data-char*="莉莉娅"][data-action="脸红生气"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/c88829e09638eaceb597598307a0a2fc7a95f574932ddb62.png") !important; }
[data-char*="莉莉娅"][data-action="皱眉"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/0c931f76312656a1adba06ef25281d0f76f24750c65b0c3d.png") !important; }
[data-char*="莉莉娅"][data-action="脸红皱眉"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/a015791532749a2e248b9d618ddf3c27e978def1c6f82f01.png") !important; }
[data-char*="莉莉娅"][data-action="思考"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/5c621c2ded57c234081d622e74ed8744a490dae7a5b64e5e.png") !important; }
[data-char*="莉莉娅"][data-action="脸红思考"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/481fa47b90a985960d44d5f21b5b04befa908759c18b60ce.png") !important; }

/* --- 拉姆 --- */
[data-char*="拉姆"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/140a45b97be03162fb8a7e59122a125807d4ba4f42278523.png") !important; }
[data-char*="拉姆"][data-action*="脸红"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/5373f09e5f43e6bfb473ed2951eaaef7422d14b2413c6e03.png") !important; }
[data-char*="拉姆"][data-action="通常"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/140a45b97be03162fb8a7e59122a125807d4ba4f42278523.png") !important; }
[data-char*="拉姆"][data-action="脸红通常"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/5373f09e5f43e6bfb473ed2951eaaef7422d14b2413c6e03.png") !important; }
[data-char*="拉姆"][data-action="得意"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/5a4644d2b95eae96d5a4e0dc1d462189eb01207576b4c697.png") !important; }
[data-char*="拉姆"][data-action="脸红得意"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/0ffd5cf4b3662abfa4856718ed40f856a198f651f88d0c9b.png") !important; }
[data-char*="拉姆"][data-action="腹黑笑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/74f41da98f1b606b10dabf415ad9c5c5d6bb56061e484a80.png") !important; }
[data-char*="拉姆"][data-action="脸红腹黑笑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/f79ea39e185e226dc8d88d6a29e85b6a797828387b74f536.png") !important; }
[data-char*="拉姆"][data-action="害羞"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/a6672c37788e684665c5a666736fb0cbbbf666c937dfa0e6.png") !important; }
[data-char*="拉姆"][data-action="惊讶"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/ff30b934b7d652e4faa60cebe8e7724fad2dc33273fd6242.png") !important; }
[data-char*="拉姆"][data-action="脸红惊讶"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/742102bff8b8c2fea5ca5fd1359fd4ada5752cbbd406f95c.png") !important; }
[data-char*="拉姆"][data-action="高兴"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/e45fc8cf4f6a3ca5f0dc5994eebd07c08e6071b0c3afc3db.png") !important; }
[data-char*="拉姆"][data-action="脸红高兴"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/6971c3fbdb1da74e72900f6411c96a74bcb7fbac340d4a9a.png") !important; }
[data-char*="拉姆"][data-action="难过"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/ff5a6c234bad96b8012708b87770f2edceb98e448ca17d61.png") !important; }
[data-char*="拉姆"][data-action="脸红难过"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/ebba5db55d801c71fd3b8cffd4be48e2776500ecf12c9c2e.png") !important; }
[data-char*="拉姆"][data-action="疑惑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/25b666f1abd61ad6c6b0ce9d25b3deae1c121b60f881fcae.png") !important; }
[data-char*="拉姆"][data-action="脸红疑惑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/8a842bdf35ba9e1cbee5f26467b169c7d39c69bfc3fa6509.png") !important; }
[data-char*="拉姆"][data-action="生气"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/c473be2f0ad52d56f1fba2d5f34352d2e8e90f4630d5823d.png") !important; }
[data-char*="拉姆"][data-action="脸红生气"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/e49e5c775b29b1887319005a21d556efa17187d443e2b908.png") !important; }
[data-char*="拉姆"][data-action="皱眉"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/74f41da98f1b606b10dabf415ad9c5c5d6bb56061e484a80.png") !important; }
[data-char*="拉姆"][data-action="脸红皱眉"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/f79ea39e185e226dc8d88d6a29e85b6a797828387b74f536.png") !important; }
[data-char*="拉姆"][data-action="思考"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/a6c058a724dc806d5b2b8715793bebb00697067776c1169c.png") !important; }
[data-char*="拉姆"][data-action="脸红思考"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/35b3c80b9fc7c03529c4a2ea2751aedd0197b46d8fb5daf4.png") !important; }

/* --- 艾拉 --- */
[data-char*="艾拉"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/bdf825043d9582bba3d3ec9ae02dafad295f3a856a6c53ab.png") !important; }
[data-char*="艾拉"][data-action*="脸红"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/0344fa170ffe85346ae5906940be3ba654135fb78c203a37.png") !important; }
[data-char*="艾拉"][data-action="通常"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/bdf825043d9582bba3d3ec9ae02dafad295f3a856a6c53ab.png") !important; }
[data-char*="艾拉"][data-action="脸红通常"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/0344fa170ffe85346ae5906940be3ba654135fb78c203a37.png") !important; }
[data-char*="艾拉"][data-action="得意"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/24fc0f446921ab87d98f6d9e6ac7de35191c64fae91cbe85.png") !important; }
[data-char*="艾拉"][data-action="脸红得意"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/a784ef3dfbdb87768fc4d879f6165733eb057852c89b449b.png") !important; }
[data-char*="艾拉"][data-action="腹黑笑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/504f111c623dff93a92557b3e6e5ca562ee663bc6436a10a.png") !important; }
[data-char*="艾拉"][data-action="脸红腹黑笑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/4c9988ee89d45667b03a8ca273763a4ed2cc7086f1d56548.png") !important; }
[data-char*="艾拉"][data-action="害羞"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/1a2c3bd276841201fc6f7aa719f76d914e725ae1e06b95ef.png") !important; }
[data-char*="艾拉"][data-action="惊讶"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/7d74469e0fce225d67f0bad63622c1bfc62b56ecd796161f.png") !important; }
[data-char*="艾拉"][data-action="脸红惊讶"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/44367a10dcb2e244c721a29ee9e70b1dfc2e657a5206619c.png") !important; }
[data-char*="艾拉"][data-action="高兴"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/bdf825043d9582bba3d3ec9ae02dafad295f3a856a6c53ab.png") !important; }
[data-char*="艾拉"][data-action="脸红高兴"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/0344fa170ffe85346ae5906940be3ba654135fb78c203a37.png") !important; }
[data-char*="艾拉"][data-action="难过"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/9d052f9a3809a445034c57c1825d82a5b7f6f87532b56adc.png") !important; }
[data-char*="艾拉"][data-action="脸红难过"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/9d052f9a3809a445034c57c1825d82a5b7f6f87532b56adc.png") !important; }
[data-char*="艾拉"][data-action="疑惑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/1985f35b5e3b17bc49a9cf2b98b87975c510bf8fc857f7eb.png") !important; }
[data-char*="艾拉"][data-action="脸红疑惑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/be2969c9dc93769607dc6f6c6cbd96c8610e71c11dc48317.png") !important; }
[data-char*="艾拉"][data-action="生气"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/e112b5d3d27ac1d16ed242795a4764a2e2b967ee5bf52845.png") !important; }
[data-char*="艾拉"][data-action="脸红生气"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/afbd6b61b5506b00e8bdab1efc29ade8c6c273bcf032e1cd.png") !important; }
[data-char*="艾拉"][data-action="皱眉"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/c9fd1e4a71e5f196d8184581007dd03c0dd000250198b74b.png") !important; }
[data-char*="艾拉"][data-action="脸红皱眉"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/f40bcc2ab6041482a2ba9b0c057bc58dfd0265d874ca4983.png") !important; }
[data-char*="艾拉"][data-action="思考"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/b7a7d7cc5c3d35d8f75bf690e393d15408b4fbefb13d11a4.png") !important; }
[data-char*="艾拉"][data-action="脸红思考"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/8dc6082603fe2cb9e2479c04388208e6946ed214615d00b3.png") !important; }

/* --- 小忆 --- */
[data-char*="小忆"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/26/f16f5cf001d3d4768eeb47187c358cc39dccf9359928fbd3.png") !important; }
[data-char*="小忆"][data-action*="脸红"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/26/4c9bc2369c704c06f597176c77446471c3cb10384307170a.png") !important; }
[data-char*="小忆"][data-action="害羞"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/26/0e9c2ca512ef6ae75d85d7a0dea0dc6d7ec7fb2fbc3d66bb.png") !important; }
[data-char*="小忆"][data-action="高兴"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/26/a9e12264d4a13b50bc82cae92e5ba3be4438e57180cce9c8.png") !important; }
[data-char*="小忆"][data-action="脸红高兴"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/26/ae9ae048696ab50bed30b90bde72617823584df9f259663b.png") !important; }
[data-char*="小忆"][data-action="难过"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/26/c3518fbefd41a3997dbf144d122a3ae38b3e9944c47096b3.png") !important; }
[data-char*="小忆"][data-action="脸红难过"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/26/f2b09a5e819f649aae6b4ce63e68aea00a5f2edd9915dee3.png") !important; }
[data-char*="小忆"][data-action="疑惑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/26/fa31b5d8dac69b313b2b560a3926348609eb5e9bdf06c1c5.png") !important; }
[data-char*="小忆"][data-action="脸红疑惑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/26/f1cb86329106e2eb4933bf85bd4f590aba12c91312957af4.png") !important; }
[data-char*="小忆"][data-action="生气"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/26/b7588776e4ef5d3729d0d077f9c65f7d1863c7c67f829dce.png") !important; }
[data-char*="小忆"][data-action="脸红生气"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/26/dfbf43577a58bcefbec403bfb265f8cf3b52ecf47ba6c6bf.png") !important; }
[data-char*="小忆"][data-action="皱眉"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/26/6adaf2d99d690d5233ade40e39d49519a69d5e8cde21ff0a.png") !important; }
[data-char*="小忆"][data-action="脸红皱眉"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/26/bfe18b6a1a252d59a4ebb5e68c31ad21ad1562d6d924d9c1.png") !important; }
[data-char*="小忆"][data-action="思考"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/26/76bccccd741753bd6487ba79df2c2f94e4b26506808fca3a.png") !important; }
[data-char*="小忆"][data-action="脸红思考"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/26/70dbb571e49c342453c34f6d85d244f484aeff748cce3377.png") !important; }

/* --- 夏洛特 --- */
[data-char*="夏洛特"]:not([data-char*="驱魔"]) .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/cfd04c9114e4aa6437c8334891a48cc3fdc86ac377d63ceb.png") !important; }
[data-char*="夏洛特"]:not([data-char*="驱魔"])[data-action*="脸红"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/17ede3423819c10acc3fd15529e238ad817d2b8c0a500407.png") !important; }
[data-char*="夏洛特"]:not([data-char*="驱魔"])[data-action="通常"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/cfd04c9114e4aa6437c8334891a48cc3fdc86ac377d63ceb.png") !important; }
[data-char*="夏洛特"]:not([data-char*="驱魔"])[data-action="脸红通常"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/17ede3423819c10acc3fd15529e238ad817d2b8c0a500407.png") !important; }
[data-char*="夏洛特"]:not([data-char*="驱魔"])[data-action="得意"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/cfd04c9114e4aa6437c8334891a48cc3fdc86ac377d63ceb.png") !important; }
[data-char*="夏洛特"]:not([data-char*="驱魔"])[data-action="脸红得意"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/17ede3423819c10acc3fd15529e238ad817d2b8c0a500407.png") !important; }
[data-char*="夏洛特"]:not([data-char*="驱魔"])[data-action="腹黑笑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/0633dfad6369bd7ebb2d49c69cd14fdb8a341311ae7b8685.png") !important; }
[data-char*="夏洛特"]:not([data-char*="驱魔"])[data-action="脸红腹黑笑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/28125c96576b7cd3003c25555e95dfdd4f0215ec201efb15.png") !important; }
[data-char*="夏洛特"]:not([data-char*="驱魔"])[data-action="害羞"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/fd78c6de36e9fde85d236aadcb64efba6d97e3ce96d68f69.png") !important; }
[data-char*="夏洛特"]:not([data-char*="驱魔"])[data-action="惊讶"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/2f1ae844d9da7a93d1d32c786c888d2724eb614cc80f0b1f.png") !important; }
[data-char*="夏洛特"]:not([data-char*="驱魔"])[data-action="脸红惊讶"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/b44a44dc9ac484206bec4fab835b44e0cedda2fc3d621e97.png") !important; }
[data-char*="夏洛特"]:not([data-char*="驱魔"])[data-action="高兴"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/cfd04c9114e4aa6437c8334891a48cc3fdc86ac377d63ceb.png") !important; }
[data-char*="夏洛特"]:not([data-char*="驱魔"])[data-action="脸红高兴"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/17ede3423819c10acc3fd15529e238ad817d2b8c0a500407.png") !important; }
[data-char*="夏洛特"]:not([data-char*="驱魔"])[data-action="难过"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/373cff69eca7df93ab10bd528cfb8a2e6a315563ac7a13f3.png") !important; }
[data-char*="夏洛特"]:not([data-char*="驱魔"])[data-action="脸红难过"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/354b52acc079944c74d6353abdb5cdc89a77c5860a7612f6.png") !important; }
[data-char*="夏洛特"]:not([data-char*="驱魔"])[data-action="疑惑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/132bfcc5488ed6bb5e761f89b9e61b713c69908487ad115b.png") !important; }
[data-char*="夏洛特"]:not([data-char*="驱魔"])[data-action="脸红疑惑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/5fa0f99a68e7f1cd90b01f272eaa8a1d797b18346bcf33c6.png") !important; }
[data-char*="夏洛特"]:not([data-char*="驱魔"])[data-action="生气"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/1a3c35464e826bb8b6d22fe69fb1e26b72522e3c667cf430.png") !important; }
[data-char*="夏洛特"]:not([data-char*="驱魔"])[data-action="脸红生气"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/3ab045acdbc69d14e587bab597976917d1bd8b2b09646cc7.png") !important; }
[data-char*="夏洛特"]:not([data-char*="驱魔"])[data-action="皱眉"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/5b94ab6af14d77bb506c6239a578e86668143ce047e1748d.png") !important; }
[data-char*="夏洛特"]:not([data-char*="驱魔"])[data-action="脸红皱眉"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/b742e73b95fbd63448557cce8719fcd8ed4d274dc4d8af9e.png") !important; }
[data-char*="夏洛特"]:not([data-char*="驱魔"])[data-action="思考"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/5b94ab6af14d77bb506c6239a578e86668143ce047e1748d.png") !important; }
[data-char*="夏洛特"]:not([data-char*="驱魔"])[data-action="脸红思考"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/b742e73b95fbd63448557cce8719fcd8ed4d274dc4d8af9e.png") !important; }

/* --- 驱魔夏洛特 --- */
[data-char*="驱魔夏洛特"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/0d6698fda3e658892f161b80cd5bb3d425023db57b3a592c.png") !important; }
[data-char*="驱魔夏洛特"][data-action*="脸红"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/5744cb0fd20d8d0298003a8776a227d0ec271693ec8b44bc.png") !important; }
[data-char*="驱魔夏洛特"][data-action="通常"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/0d6698fda3e658892f161b80cd5bb3d425023db57b3a592c.png") !important; }
[data-char*="驱魔夏洛特"][data-action="脸红通常"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/5744cb0fd20d8d0298003a8776a227d0ec271693ec8b44bc.png") !important; }
[data-char*="驱魔夏洛特"][data-action="得意"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/0d6698fda3e658892f161b80cd5bb3d425023db57b3a592c.png") !important; }
[data-char*="驱魔夏洛特"][data-action="脸红得意"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/5744cb0fd20d8d0298003a8776a227d0ec271693ec8b44bc.png") !important; }
[data-char*="驱魔夏洛特"][data-action="腹黑笑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/aa7bb572fd58d7883dbd9db365fb1c998512926feb792042.png") !important; }
[data-char*="驱魔夏洛特"][data-action="脸红腹黑笑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/57716fe6c3d7a991bfc5e0c6f98b8c798732832bc7c78d5f.png") !important; }
[data-char*="驱魔夏洛特"][data-action="害羞"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/3a4a41420a26d1fa03f2458843530d5ceea7f0f6d2e8636d.png") !important; }
[data-char*="驱魔夏洛特"][data-action="惊讶"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/60938571c8109541e0cd6c552a3aa9794a0ad76e3ad3dd22.png") !important; }
[data-char*="驱魔夏洛特"][data-action="脸红惊讶"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/e3522067f6aef9d9ea3dfdc3903e1ed7038519c82a2df285.png") !important; }
[data-char*="驱魔夏洛特"][data-action="高兴"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/0d6698fda3e658892f161b80cd5bb3d425023db57b3a592c.png") !important; }
[data-char*="驱魔夏洛特"][data-action="脸红高兴"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/5744cb0fd20d8d0298003a8776a227d0ec271693ec8b44bc.png") !important; }
[data-char*="驱魔夏洛特"][data-action="难过"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/004fc1902408c91eedb3659171da1a636cd3593bb4c248a6.png") !important; }
[data-char*="驱魔夏洛特"][data-action="脸红难过"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/a8d725ee82b375d200ccf00a08e6c85bb71a5be942ea53ef.png") !important; }
[data-char*="驱魔夏洛特"][data-action="疑惑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/5be9012b86e986273ea08f1d5040c3e3eeab0a1dd134823a.png") !important; }
[data-char*="驱魔夏洛特"][data-action="脸红疑惑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/e389dd83b248bcc689a95fef9e22b80041710f689e7c152b.png") !important; }
[data-char*="驱魔夏洛特"][data-action="生气"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/1cfb52f27da7571867af74aeb8aef421a7548824e97fb741.png") !important; }
[data-char*="驱魔夏洛特"][data-action="脸红生气"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/83e7d9d6afdda9e71be8f9d491be73a2f248f1b661d5058e.png") !important; }
[data-char*="驱魔夏洛特"][data-action="皱眉"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/444c7a13e195cd3bb09dff1fde76888cb085ebc94d92ff28.png") !important; }
[data-char*="驱魔夏洛特"][data-action="脸红皱眉"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/af0eac513a0dbe694e7b22197fff769be8a72123bb46e722.png") !important; }
[data-char*="驱魔夏洛特"][data-action="思考"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/444c7a13e195cd3bb09dff1fde76888cb085ebc94d92ff28.png") !important; }
[data-char*="驱魔夏洛特"][data-action="脸红思考"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/af0eac513a0dbe694e7b22197fff769be8a72123bb46e722.png") !important; }

/* --- 法妮雅 --- */
[data-char*="法妮雅"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/a8ee953f071a831f7a0d909307d81494fb18f557364cbaaf.png") !important; }
[data-char*="法妮雅"][data-action*="脸红"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/dc26ab56d73b923c48f535bc9fd6c124ecd2d2222acfb324.png") !important; }
[data-char*="法妮雅"][data-action="通常"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/a8ee953f071a831f7a0d909307d81494fb18f557364cbaaf.png") !important; }
[data-char*="法妮雅"][data-action="脸红通常"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/dc26ab56d73b923c48f535bc9fd6c124ecd2d2222acfb324.png") !important; }
[data-char*="法妮雅"][data-action="得意"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/a6f9e367e553f9c0deba22923d477f1b82f1c8bd3307f2f2.png") !important; }
[data-char*="法妮雅"][data-action="脸红得意"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/3d2bbebbdf9de5447bb8b39c49b6b974f94f971f16399262.png") !important; }
[data-char*="法妮雅"][data-action="腹黑笑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/b1ba188b486bac6aa6a4ef870d7fabb3206532753eb0d3a6.png") !important; }
[data-char*="法妮雅"][data-action="脸红腹黑笑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/5638dc7fa7e98a5ad3d1fa8e830d5154846b8721276d436d.png") !important; }
[data-char*="法妮雅"][data-action="害羞"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/0a988e5127900aceeffdd65956d01b9b363626f4e6629b92.png") !important; }
[data-char*="法妮雅"][data-action="惊讶"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/8ef2321547b240b15140aa25496283ada16b41450020c854.png") !important; }
[data-char*="法妮雅"][data-action="脸红惊讶"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/6ce15e5ebe4ec90d196951b86cb4de2a62ad5c86f558938c.png") !important; }
[data-char*="法妮雅"][data-action="高兴"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/a8ee953f071a831f7a0d909307d81494fb18f557364cbaaf.png") !important; }
[data-char*="法妮雅"][data-action="脸红高兴"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/dc26ab56d73b923c48f535bc9fd6c124ecd2d2222acfb324.png") !important; }
[data-char*="法妮雅"][data-action="难过"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/bbd3f1032708104e02112594c1ef1969c3d79dcd44029d61.png") !important; }
[data-char*="法妮雅"][data-action="脸红难过"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/3447f4adc37ca9212b5d31b5bf1f9b770fac15e329dfdb75.png") !important; }
[data-char*="法妮雅"][data-action="疑惑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/b76c0122153ea152309e51544573c343fccbe89aadcbd94e.png") !important; }
[data-char*="法妮雅"][data-action="脸红疑惑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/83b292585b5633860ef565ab7fe54d86fe6833d41624c909.png") !important; }
[data-char*="法妮雅"][data-action="生气"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/0bc3f46764dae45f7fd0899f3f5904ba5d8a8ad12737f4c3.png") !important; }
[data-char*="法妮雅"][data-action="脸红生气"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/44f5455476055a28a4e7faeed379122f45954a04b68970fd.png") !important; }
[data-char*="法妮雅"][data-action="皱眉"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/dc271f941fe0a1ff61d886e593c1ddb127296d869e7c25a5.png") !important; }
[data-char*="法妮雅"][data-action="脸红皱眉"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/7179a93ec4c569cf05964f435b39ff4d393088436c39bf3a.png") !important; }
[data-char*="法妮雅"][data-action="思考"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/342100af6b594719b0584a256c732687de552852d6bff1be.png") !important; }
[data-char*="法妮雅"][data-action="脸红思考"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/a922129cb7b2390ebf7000808da5ce0b2844e8a5cb1a52bf.png") !important; }

/* --- 响木天音 --- */
[data-char*="响木天音"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/37006260238a0b0548b3bfa0782220d3008ccef9e096d764.png") !important; }
[data-char*="响木天音"][data-action*="脸红"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/968070cc0a5bd6b6e22d784bc9be757e4b2cc7969ceeba79.png") !important; }
[data-char*="响木天音"][data-action="通常"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/37006260238a0b0548b3bfa0782220d3008ccef9e096d764.png") !important; }
[data-char*="响木天音"][data-action="脸红通常"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/968070cc0a5bd6b6e22d784bc9be757e4b2cc7969ceeba79.png") !important; }
[data-char*="响木天音"][data-action="得意"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/0c088a148fdce3a11b949aa6d436c12304d09da36592a70b.png") !important; }
[data-char*="响木天音"][data-action="脸红得意"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/3eb50c308eb325690a5e683320c6cacbb23ad59fd4e1874d.png") !important; }
[data-char*="响木天音"][data-action="腹黑笑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/82a58aeda1132dd753f5990bceb88900c96553876630142a.png") !important; }
[data-char*="响木天音"][data-action="脸红腹黑笑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/90468c182f3b34a7681b524837a581001eb31c102fecf2c1.png") !important; }
[data-char*="响木天音"][data-action="害羞"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/87733037a0e1dd3511c1ad8405821fb773c5312b5ad2d468.png") !important; }
[data-char*="响木天音"][data-action="惊讶"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/135f583300e3e1fd347f129101a2a09c9d0588e478cf74c0.png") !important; }
[data-char*="响木天音"][data-action="脸红惊讶"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/8da52a5cf5bf7af54dafc3e2bd043803fec00cefd8026053.png") !important; }
[data-char*="响木天音"][data-action="高兴"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/37006260238a0b0548b3bfa0782220d3008ccef9e096d764.png") !important; }
[data-char*="响木天音"][data-action="脸红高兴"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/968070cc0a5bd6b6e22d784bc9be757e4b2cc7969ceeba79.png") !important; }
[data-char*="响木天音"][data-action="难过"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/1214a0073dbb188fb3d19deda0cd9188d48df7e88e9eff21.png") !important; }
[data-char*="响木天音"][data-action="脸红难过"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/eb43a141cc901e3b42b622c9d02d6cfb05436fd9320e7478.png") !important; }
[data-char*="响木天音"][data-action="疑惑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/ef2b985077313d67a72e80b7bc4884c65d62f3cd7d567fce.png") !important; }
[data-char*="响木天音"][data-action="脸红疑惑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/b2b4e5550fb91cef8df986d31e6bf6cdfe94949fb7b3ae9a.png") !important; }
[data-char*="响木天音"][data-action="生气"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/1e263de38c1a66edfc7a60b198893afecbd383209ae202ee.png") !important; }
[data-char*="响木天音"][data-action="脸红生气"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/60896d68b0961f6af5a81fb19f84c18279fcccbd44e19514.png") !important; }
[data-char*="响木天音"][data-action="皱眉"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/0bf34a77adf11c44c1e3be74231034052070184bf3c77f15.png") !important; }
[data-char*="响木天音"][data-action="脸红皱眉"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/c794a80179e3029e8a688c6b9443a3c14d57899752731a82.png") !important; }
[data-char*="响木天音"][data-action="思考"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/0dc4d3e6244ca8b2eeb7b6a3a189cf0aedf333753e51bbb3.png") !important; }
[data-char*="响木天音"][data-action="脸红思考"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/01b3b8b9654a36204022ffcc526cbf5c2eebe37a3eab8b86.png") !important; }

/* --- 芙洛蒂 --- */
[data-char*="芙洛蒂"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/4dc6200820290c3f0850b1ef48e107eec138f9223373b60b.png") !important; }
[data-char*="芙洛蒂"][data-action*="脸红"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/761251f598385cb4e84e7fe9b2808ac1a5c77c489d88c204.png") !important; }
[data-char*="芙洛蒂"][data-action="通常"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/4dc6200820290c3f0850b1ef48e107eec138f9223373b60b.png") !important; }
[data-char*="芙洛蒂"][data-action="脸红通常"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/761251f598385cb4e84e7fe9b2808ac1a5c77c489d88c204.png") !important; }
[data-char*="芙洛蒂"][data-action="得意"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/1910e7ec8bdda4644196e5feefc1a40462384bc404e16824.png") !important; }
[data-char*="芙洛蒂"][data-action="脸红得意"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/b64cdbd574d7d1f366ad232fad12ec618397129c794f7000.png") !important; }
[data-char*="芙洛蒂"][data-action="腹黑笑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/215d8f840735c8401.png") !important; }
[data-char*="芙洛蒂"][data-action="脸红腹黑笑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/cc1ce4fb0d6e9e419e220d077e6ccc89b1aeeda9d0be80fe.png") !important; }
[data-char*="芙洛蒂"][data-action="害羞"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/5c9d2c61658d0f7f8c0e08fda71019bd6bff1295d78fa54f.png") !important; }
[data-char*="芙洛蒂"][data-action="惊讶"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/b58bdeea3de83de2611f8bcdca60f884064c63bb37f77520.png") !important; }
[data-char*="芙洛蒂"][data-action="脸红惊讶"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/b5f254484e7d070c2d6559f5643ed5a2bc186e8497cbfc0f.png") !important; }
[data-char*="芙洛蒂"][data-action="高兴"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/7741a580e299ef7088a3b3e29327116d3cdd8d6fcb336740.png") !important; }
[data-char*="芙洛蒂"][data-action="脸红高兴"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/c31db8d99fbb5d8b7f499eb23ce59b13167106c147a369fb.png") !important; }
[data-char*="芙洛蒂"][data-action="难过"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/bc41c7df1dd5b50c73483d1285105099adfd72854182d590.png") !important; }
[data-char*="芙洛蒂"][data-action="脸红难过"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/6bbb778b59f1f1f3f25c12cad956d0c6bd33b52159b31148.png") !important; }
[data-char*="芙洛蒂"][data-action="疑惑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/ad6a0dc6bb7aa62657ab7162c72108d22fcb1d1fde365fdb.png") !important; }
[data-char*="芙洛蒂"][data-action="脸红疑惑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/a4f299e44dec334cd34c35e2a3d233efe7e4fc35f6db3c1f.png") !important; }
[data-char*="芙洛蒂"][data-action="生气"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/5fb5bb2009c95735e16badf596359f34b3ea18964e250e0f.png") !important; }
[data-char*="芙洛蒂"][data-action="脸红生气"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/4450f12ccf1bbefff87a08d4d8da723db2b3a4987db21d6d.png") !important; }
[data-char*="芙洛蒂"][data-action="皱眉"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/72b570130c16fcbaa244cb0285a402c75b744cd7bf331f09.png") !important; }
[data-char*="芙洛蒂"][data-action="脸红皱眉"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/a66b9f2b67462e51a1874a44f541de23cbeee88fb7f1538f.png") !important; }
[data-char*="芙洛蒂"][data-action="思考"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/72b570130c16fcbaa244cb0285a402c75b744cd7bf331f09.png") !important; }
[data-char*="芙洛蒂"][data-action="脸红思考"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/a66b9f2b67462e51a1874a44f541de23cbeee88fb7f1538f.png") !important; }

/* --- 艾妮希雅 --- */
[data-char*="艾妮希雅"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/35c2aa1a16d684964cdc8c58bc8438ff4dc4733308eeb8a0.png") !important; }
[data-char*="艾妮希雅"][data-action*="脸红"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/eaa159fc8f0f59a4ee2cc572eeb1d1d09e8234a1f85b1bf1.png") !important; }
[data-char*="艾妮希雅"][data-action="通常"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/35c2aa1a16d684964cdc8c58bc8438ff4dc4733308eeb8a0.png") !important; }
[data-char*="艾妮希雅"][data-action="脸红通常"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/eaa159fc8f0f59a4ee2cc572eeb1d1d09e8234a1f85b1bf1.png") !important; }
[data-char*="艾妮希雅"][data-action="得意"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/eddaaaeeca442b8090a9e14c55c3105695e53325b70a3cbc.png") !important; }
[data-char*="艾妮希雅"][data-action="脸红得意"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/853777cf7453780928899de29abb9865a5b16fe637c4e296.png") !important; }
[data-char*="艾妮希雅"][data-action="腹黑笑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/ccb160dd526efa67f4e809c599df73746b98ee5983a6da0d.png") !important; }
[data-char*="艾妮希雅"][data-action="脸红腹黑笑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/4c6b6d14051b5459c3c8c16abf8c07f5049cf033b4fc6ee8.png") !important; }
[data-char*="艾妮希雅"][data-action="害羞"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/eaa159fc8f0f59a4ee2cc572eeb1d1d09e8234a1f85b1bf1.png") !important; }
[data-char*="艾妮希雅"][data-action="惊讶"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/09c6472e21e9107ca96dc93c8847e2dbb7f22f47426c67f3.png") !important; }
[data-char*="艾妮希雅"][data-action="脸红惊讶"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/1daa34af17fd0af1ede733b3a4bd1d6706aca34122fa6f8a.png") !important; }
[data-char*="艾妮希雅"][data-action="高兴"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/35c2aa1a16d684964cdc8c58bc8438ff4dc4733308eeb8a0.png") !important; }
[data-char*="艾妮希雅"][data-action="脸红高兴"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/eaa159fc8f0f59a4ee2cc572eeb1d1d09e8234a1f85b1bf1.png") !important; }
[data-char*="艾妮希雅"][data-action="难过"] .custom-nvn-avatar-img {background-image: url("https://origin.picgo.net/2026/09/25/a898b5787c34fec0cb1af743ca7e0b06d3821cc3e4a5e6cd.png") !important; }
[data-char*="艾妮希雅"][data-action="脸红难过"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/9027755c75bb255d05f6e73c297954bd9a488dfd1ca8a4c2.png") !important; }
[data-char*="艾妮希雅"][data-action="疑惑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/6480296779018092160bb17450f0befca3d61c9fbec30c04.png") !important; }
[data-char*="艾妮希雅"][data-action="脸红疑惑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/1517344b0c847000b3abb9b2aea6420422d025b7a354bdac.png") !important; }
[data-char*="艾妮希雅"][data-action="生气"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/54c8671fd93eae33bd8e3804eac3368192e7dec5b164140f.png") !important; }
[data-char*="艾妮希雅"][data-action="脸红生气"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/24f127fa3191ec70e1a5af45dd27e221a1a4edd547bfacc0.png") !important; }
[data-char*="艾妮希雅"][data-action="皱眉"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/3ac7a2dc3a6a32b01f1b1ac5306a90bb351d05207f10a733.png") !important; }
[data-char*="艾妮希雅"][data-action="脸红皱眉"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/309405ac25144be46da740218c043cd7653e82b2b75a1293.png") !important; }
[data-char*="艾妮希雅"][data-action="思考"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/e53024c7ae4441a4ab69bec6c004986baa400acd5c70c929.png") !important; }
[data-char*="艾妮希雅"][data-action="脸红思考"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/2bd7932b70435189d4a816eb2b515d72d5e9e85f3ace7e91.png") !important; }

/* --- 凯拉涅斯 --- */
[data-char*="凯拉涅斯"][data-action="通常"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/bb4a5ed33708e06d417eda8ddb0e91f68e74b80f51d10325.png") !important; }
[data-char*="凯拉涅斯"][data-action="脸红通常"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/19d361065316c419fa1787454076912c04ec50b9190306b6.png") !important; }
[data-char*="凯拉涅斯"][data-action="得意"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/b0b5767671323c47ba97584d8c0035b2b0f93e598d8a0ec0.png") !important; }
[data-char*="凯拉涅斯"][data-action="脸红得意"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/05da5bd0cb6b39cb132ec3069862cfe95e0b44ed3449d9b3.png") !important; }
[data-char*="凯拉涅斯"][data-action="腹黑笑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/163d2c78c25d5b4f464fa6bc85cc115df7d63b47c3dbb8f9.png") !important; }
[data-char*="凯拉涅斯"][data-action="脸红腹黑笑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/ec2e4e57713017f183b42f2c095f40b8cc682018530dfc9c.png") !important; }
[data-char*="凯拉涅斯"][data-action="害羞"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/73100106dbfc51ee7beba1c2260cb578ea2867e6d149cfa5.png") !important; }
[data-char*="凯拉涅斯"][data-action="惊讶"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/2ed552023696372e810c8033eb4a93654f1ed2b367dd8c73.png") !important; }
[data-char*="凯拉涅斯"][data-action="脸红惊讶"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/e164a5f586a5ca64a691fb6e76e2b7ac9ce94f11b75c20d7.png") !important; }
[data-char*="凯拉涅斯"][data-action="高兴"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/edc8201290d49d3af77a6312f5ca81dffc2411d8b342c690.png") !important; }
[data-char*="凯拉涅斯"][data-action="脸红高兴"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/c3d318659e617484a26625eee271a1632accf51f4dd57d3d.png") !important; }
[data-char*="凯拉涅斯"][data-action="难过"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/93ad095e0e00821f61089a5394e08a4ee9e673a6be10e5e0.png") !important; }
[data-char*="凯拉涅斯"][data-action="脸红难过"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/5bd3a69ec637821daee29b5e3a29a7fc35aec146b2b2a5d4.png") !important; }
[data-char*="凯拉涅斯"][data-action="疑惑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/07c49ba596c6eb45bf18ffa7d8041a4443db4d49166364f9.png") !important; }
[data-char*="凯拉涅斯"][data-action="脸红疑惑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/08550fd10026d5832eb9e05d11b499e038172d5f289baf73.png") !important; }
[data-char*="凯拉涅斯"][data-action="生气"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/6f5a3860a9161a0a6dd32f373aea514c853b0ac4e240c735.png") !important; }
[data-char*="凯拉涅斯"][data-action="脸红生气"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/cbd91e58992bb3d62185471f4eb7e06c1a5ff1024bff89f3.png") !important; }
[data-char*="凯拉涅斯"][data-action="皱眉"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/dfa8435988bf21544143f812d0f01a7a97976f338a6ba802.png") !important; }
[data-char*="凯拉涅斯"][data-action="脸红皱眉"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/144dd01b446f9648ae84ba1f0e2418c4b969708fa8368280.png") !important; }
[data-char*="凯拉涅斯"][data-action="思考"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/d873746a739c257fb0dfab9dd3d89d5200208686987d4920.png") !important; }
[data-char*="凯拉涅斯"][data-action="脸红思考"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/736b4be84862d4d4c79be5a367799865931e0be86be66250.png") !important; }

/* --- 蒂莎 --- */
[data-char*="蒂莎"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/dddf9f7b026a25a6fe59bfc6e7d6bdfcd3801f07834c4e22.png") !important; }
[data-char*="蒂莎"][data-action*="脸红"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/cd4f84f4e5f2a228a0c81018163d47cab6cef34994c54e1b.png") !important; }
[data-char*="蒂莎"][data-action="通常"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/dddf9f7b026a25a6fe59bfc6e7d6bdfcd3801f07834c4e22.png") !important; }
[data-char*="蒂莎"][data-action="脸红通常"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/cd4f84f4e5f2a228a0c81018163d47cab6cef34994c54e1b.png") !important; }
[data-char*="蒂莎"][data-action="害羞"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/cd4f84f4e5f2a228a0c81018163d47cab6cef34994c54e1b.png") !important; }
[data-char*="蒂莎"][data-action="惊讶"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/37b1b7f000be329044faaa949a9774ac3b091066508db442.png") !important; }
[data-char*="蒂莎"][data-action="脸红惊讶"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/b425b9aa123ab85ab24dcdbeda474768f164bdcf41d5d039.png") !important; }
[data-char*="蒂莎"][data-action="高兴"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/37c4840847a24f26c2248d81e92a871c5891420c37de0b0d.png") !important; }
[data-char*="蒂莎"][data-action="脸红高兴"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/02f9164b5c8fc50d3249d1319c62bcfb7d6816cae8560e79.png") !important; }
[data-char*="蒂莎"][data-action="难过"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/d7248b7247dac3161914dca68efc4b3c5a169f78798f6f77.png") !important; }
[data-char*="蒂莎"][data-action="脸红难过"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/45d4f037e30145936d5426decd3f3f69f4e41c4cefc9dd4e.png") !important; }
[data-char*="蒂莎"][data-action="疑惑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/d6b44be4b1d598f50b7f90e4dd66435f35aa9c4da76eaacc.png") !important; }
[data-char*="蒂莎"][data-action="脸红疑惑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/9cfc11e1246f77c87edc23a6990132ebe187df874ea3fd2b.png") !important; }
[data-char*="蒂莎"][data-action="生气"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/1488c7a6d47fe18a5939ef9ba0f5da3965b7edfdd78bac47.png") !important; }
[data-char*="蒂莎"][data-action="脸红生气"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/333a34d86f98aa691af93096dd41cee21ae13b8aa89972e3.png") !important; }
[data-char*="蒂莎"][data-action="皱眉"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/76beac97f01431eed7e760648123ea9e21957cc3846a73eb.png") !important; }
[data-char*="蒂莎"][data-action="脸红皱眉"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/b8b6f0ac801dae9590eab81d4466978c9892b39f0918cfa4.png") !important; }

/* --- 奇诺米 --- */
[data-char*="奇诺米"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/0c120bef0861efca8485e86c94aea4917f2ecc31a8c236b7.png") !important; }
[data-char*="奇诺米"][data-action*="脸红"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/8b676a49771da051452bb60b8f420d9b1d71616e69d46ab9.png") !important; }
[data-char*="奇诺米"][data-action="通常"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/0c120bef0861efca8485e86c94aea4917f2ecc31a8c236b7.png") !important; }
[data-char*="奇诺米"][data-action="脸红通常"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/8b676a49771da051452bb60b8f420d9b1d71616e69d46ab9.png") !important; }
[data-char*="奇诺米"][data-action="得意"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/2e4b33da6b638e943da01b73593600a654e427c8789e4959.png") !important; }
[data-char*="奇诺米"][data-action="脸红得意"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/f550a9f293cd4f2d4091ea1d5c9ab587ca7a9d5ce6f28648.png") !important; }
[data-char*="奇诺米"][data-action="害羞"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/8b676a49771da051452bb60b8f420d9b1d71616e69d46ab9.png") !important; }
[data-char*="奇诺米"][data-action="惊讶"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/6c8c027a2c39baff29af49f32a7f3d2851970c62119a894d.png") !important; }
[data-char*="奇诺米"][data-action="脸红惊讶"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/4fae0681a8c525f525f432e8058b9c48ef8f757e440c7563.png") !important; }
[data-char*="奇诺米"][data-action="高兴"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/cc5d79be4b9fd9bdd15c04a2f61d2288137f9b809e25e2f3.png") !important; }
[data-char*="奇诺米"][data-action="脸红高兴"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/7e4cc79239b72fec311f2190527573c204c9e8008a9cce65.png") !important; }
[data-char*="奇诺米"][data-action="难过"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/565c50f840b40076517da5e5f70ae52e8d4ed3fc073313cf.png") !important; }
[data-char*="奇诺米"][data-action="脸红难过"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/981327d0151df178dedbd4197ae2175da8dd341034559405.png") !important; }
[data-char*="奇诺米"][data-action="疑惑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/ce0f9b4b3d3b31f312cc92c80524f86e533a4d3bdac0aa17.png") !important; }
[data-char*="奇诺米"][data-action="脸红疑惑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/597ca0191f1c0fd043b252aa86d778212a6e39347aef34a7.png") !important; }
[data-char*="奇诺米"][data-action="生气"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/176801e6a262b5da09e0ed99b58394af84528e0348bb6ebf.png") !important; }
[data-char*="奇诺米"][data-action="脸红生气"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/051cae49a0cecb1a6ab619a71709efddbe24b2bba8761b5b.png") !important; }

/* --- 帕特里琪娅 --- */
[data-char*="帕特里琪娅"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/fbe5e0bbc4983a9368ddb8721d7589280f23e9bc35f9a04d.png") !important; }
[data-char*="帕特里琪娅"][data-action*="脸红"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/8826fe1f6e741e9972396b6550475f944e4b07703b16ff01.png") !important; }
[data-char*="帕特里琪娅"][data-action="通常"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/fbe5e0bbc4983a9368ddb8721d7589280f23e9bc35f9a04d.png") !important; }
[data-char*="帕特里琪娅"][data-action="脸红通常"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/8826fe1f6e741e9972396b6550475f944e4b07703b16ff01.png") !important; }
[data-char*="帕特里琪娅"][data-action="得意"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/9ec93fbad0ac21f6eb6c9e77cd3b91a9c33ee38f454e5fa6.png") !important; }
[data-char*="帕特里琪娅"][data-action="脸红得意"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/83878b90695bb027b66562a931bfe634f92e3030b461bb6c.png") !important; }
[data-char*="帕特里琪娅"][data-action="害羞"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/8826fe1f6e741e9972396b6550475f944e4b07703b16ff01.png") !important; }
[data-char*="帕特里琪娅"][data-action="惊讶"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/83d664e91224723628283c154f135500ba44932bececdbf0.png") !important; }
[data-char*="帕特里琪娅"][data-action="脸红惊讶"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/c67cd9f403a15269d7275670ee9127760b6d1bad542386a4.png") !important; }
[data-char*="帕特里琪娅"][data-action="高兴"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/6e2abcfec6f0cb51cca7298829a0376853ee7c7d8e500b68.png") !important; }
[data-char*="帕特里琪娅"][data-action="脸红高兴"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/c3d3dc4aff5e583710bad29aec0d287546881babbf6f31f8.png") !important; }
[data-char*="帕特里琪娅"][data-action="难过"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/0a2b0a46fedfc92cf76259e19fa06ac859c0ffd312e4868a.png") !important; }
[data-char*="帕特里琪娅"][data-action="脸红难过"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/a7acbf78e53ae54ac900c0579b72664b80d2cc1da59c42d1.png") !important; }
[data-char*="帕特里琪娅"][data-action="疑惑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/cb7fee3d995f9ecffd25da073fd4614ab51e6f84929bce9c.png") !important; }
[data-char*="帕特里琪娅"][data-action="脸红疑惑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/7c79601f330d11908e112b8b2734f2a17b36acba075c7f03.png") !important; }
[data-char*="帕特里琪娅"][data-action="生气"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/872d0ee3cfd529b8ec3132c46aea19e963c1212a08c564d5.png") !important; }
[data-char*="帕特里琪娅"][data-action="脸红生气"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/4c389b351a330a4eca50628702ba1d43abd305c5def0c26c.png") !important; }
[data-char*="帕特里琪娅"][data-action="皱眉"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/4dffb231653d15c0dda4cc0f3f117ab8bc7c15b2c8a882f0.png") !important; }
[data-char*="帕特里琪娅"][data-action="脸红皱眉"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/a5ffb1394f0fdb7d9b13f59ffdc8bae8a8068b2af3d38d9c.png") !important; }
[data-char*="帕特里琪娅"][data-action="思考"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/a851b85778843e0a4f2730b1eb2c8bb4451db3a46a3a4b7e.png") !important; }
[data-char*="帕特里琪娅"][data-action="脸红思考"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/fc2234bef33ce83ecd0920cb7910f84f928615b7ad5b31f0.png") !important; }

/* --- 加莉泰娅 --- */
[data-char*="加莉泰娅"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/afbef5e55f6f940364db2f4b914370184230cc8e002f37af.png") !important; }
[data-char*="加莉泰娅"][data-action*="脸红"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/9fe1ca78b25bbf2415c2311697a913b8d64b34cf01733633.png") !important; }
[data-char*="加莉泰娅"][data-action="通常"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/afbef5e55f6f940364db2f4b914370184230cc8e002f37af.png") !important; }
[data-char*="加莉泰娅"][data-action="脸红通常"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/9fe1ca78b25bbf2415c2311697a913b8d64b34cf01733633.png") !important; }
[data-char*="加莉泰娅"][data-action="腹黑笑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/b7cf75108a177d759fae04c71b35bf645b9bf2f9024c79d7.png") !important; }
[data-char*="加莉泰娅"][data-action="脸红腹黑笑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/4e6a294e1b533e7c592e916bea105ec724e8dbdac084588f.png") !important; }
[data-char*="加莉泰娅"][data-action="害羞"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/99fff281b5782284b4a9ebecd2145bca9bfb5973db8dff98.png") !important; }
[data-char*="加莉泰娅"][data-action="惊讶"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/ac0cfdf48fdbaff44a61a8655d622360d8dbeea3c54c55e2.png") !important; }
[data-char*="加莉泰娅"][data-action="脸红惊讶"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/e8e1015bc147e112d82e7c04105bc2cd6ff3ca73bd5b9d58.png") !important; }
[data-char*="加莉泰娅"][data-action="高兴"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/1cab7ebfc4abbed0c1ed51302348d67fd96b02362fe54f66.png") !important; }
[data-char*="加莉泰娅"][data-action="脸红高兴"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/92652f0ca4e2b5a08fe2fd93d66d76b47facdb1e8f803ab9.png") !important; }
[data-char*="加莉泰娅"][data-action="难过"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/57a4cae115169583c1008765f57acfa6bb4b56a191badbf1.png") !important; }
[data-char*="加莉泰娅"][data-action="脸红难过"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/595eb426a33a6efb3c08da24208709bde99d6142923d1a0b.png") !important; }
[data-char*="加莉泰娅"][data-action="疑惑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/e12d3725743aa446d9fe612157a7375b983e921ea16afcc2.png") !important; }
[data-char*="加莉泰娅"][data-action="脸红疑惑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/47be8c9524b97cd49ea9544fa1a37214a5a0a05ca19340cd.png") !important; }
[data-char*="加莉泰娅"][data-action="生气"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/ab69dd29392c82282266e09764b5ec27a565bff6eb0d22b0.png") !important; }
[data-char*="加莉泰娅"][data-action="脸红生气"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/54be667c78af2b9669d50f0e00598be555e2937ac3005323.png") !important; }
[data-char*="加莉泰娅"][data-action="皱眉"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/a650a7b48f42fff517f876084346abb3abd5fe1976d3101d.png") !important; }
[data-char*="加莉泰娅"][data-action="脸红皱眉"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/7dedb765245e195b35d7335048162fe5393b7267e1b2a85d.png") !important; }
[data-char*="加莉泰娅"][data-action="思考"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/cb678b51d571efb24047a069fe5e066a57c77a86dfaa2313.png") !important; }
[data-char*="加莉泰娅"][data-action="脸红思考"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/59ad2d7fc6888cdc28a5d68600a37f1c156928c58ceaf5e2.png") !important; }

/* --- 盖欧露易丝 --- */
[data-char*="盖欧露易丝"] .custom-nvn-avatar-img, [data-char*="露易丝"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/80f2841ea5530359f4a924b182e2963f11d676a4db76088d.png") !important; }
[data-char*="盖欧露易丝"][data-action*="脸红"] .custom-nvn-avatar-img, [data-char*="露易丝"][data-action*="脸红"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/bc1de3a0d6084fad798acc68ca554f46ec3bd7620e4c0d9c.png") !important; }
[data-char*="盖欧露易丝"][data-action="通常"] .custom-nvn-avatar-img, [data-char*="露易丝"][data-action="通常"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/80f2841ea5530359f4a924b182e2963f11d676a4db76088d.png") !important; }
[data-char*="盖欧露易丝"][data-action="脸红通常"] .custom-nvn-avatar-img, [data-char*="露易丝"][data-action="脸红通常"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/bc1de3a0d6084fad798acc68ca554f46ec3bd7620e4c0d9c.png") !important; }
[data-char*="盖欧露易丝"][data-action="害羞"] .custom-nvn-avatar-img, [data-char*="露易丝"][data-action="害羞"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/150d438ad4d154fbf06ace72b7aec90b2049212dbace1bb9.png") !important; }
[data-char*="盖欧露易丝"][data-action="惊讶"] .custom-nvn-avatar-img, [data-char*="露易丝"][data-action="惊讶"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/e9524a1412e1e167fa7501681958dc538264b0f8e84aae76.png") !important; }
[data-char*="盖欧露易丝"][data-action="脸红惊讶"] .custom-nvn-avatar-img, [data-char*="露易丝"][data-action="脸红惊讶"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/dfffde2f41cfb4ece736fcea26f243b803124b3135abf629.png") !important; }
[data-char*="盖欧露易丝"][data-action="脸红高兴"] .custom-nvn-avatar-img, [data-char*="露易丝"][data-action="脸红高兴"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/287cc5c388e70f119c444b7c0e5173bb3c4e855dfef37339.png") !important; }
[data-char*="盖欧露易丝"][data-action="难过"] .custom-nvn-avatar-img, [data-char*="露易丝"][data-action="难过"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/688adcdb49a2432b4ba9805aaac2ec4f5d0c69038f6edb0e.png") !important; }
[data-char*="盖欧露易丝"][data-action="脸红难过"] .custom-nvn-avatar-img, [data-char*="露易丝"][data-action="脸红难过"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/e076068036533c5bb93531bb7ac687c59934448a84c5a988.png") !important; }
[data-char*="盖欧露易丝"][data-action="疑惑"] .custom-nvn-avatar-img, [data-char*="露易丝"][data-action="疑惑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/bf565ae93d2454be29aac130d6e7d3b196aaef3c2a0d9239.png") !important; }
[data-char*="盖欧露易丝"][data-action="脸红疑惑"] .custom-nvn-avatar-img, [data-char*="露易丝"][data-action="脸红疑惑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/4792b7063790640b5669f7057ca476902c3218e5a7260fc3.png") !important; }
[data-char*="盖欧露易丝"][data-action="生气"] .custom-nvn-avatar-img, [data-char*="露易丝"][data-action="生气"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/bcb6e555cd1366da48b60302785854949104c68db702f9a8.png") !important; }
[data-char*="盖欧露易丝"][data-action="脸红生气"] .custom-nvn-avatar-img, [data-char*="露易丝"][data-action="脸红生气"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/b9e49dcc99ef96e72511a5bf3918adfff5ead1fb81323de9.png") !important; }
[data-char*="盖欧露易丝"][data-action="皱眉"] .custom-nvn-avatar-img, [data-char*="露易丝"][data-action="皱眉"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/d617a6d45f20ee5d2c6fa12b7003375de93c955229e012e9.png") !important; }
[data-char*="盖欧露易丝"][data-action="脸红皱眉"] .custom-nvn-avatar-img, [data-char*="露易丝"][data-action="脸红皱眉"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/87c33acdfd8ecf3635905cf29fd02ec36026c1ec77c9bc60.png") !important; }
[data-char*="盖欧露易丝"][data-action="思考"] .custom-nvn-avatar-img, [data-char*="露易丝"][data-action="思考"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/b1b4593f95ef76b0d9de3e407003ddd8a97251def2fa8383.png") !important; }
[data-char*="盖欧露易丝"][data-action="脸红思考"] .custom-nvn-avatar-img, [data-char*="露易丝"][data-action="脸红思考"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/8515b94b81362d34f939b31c38b4ea3af58dd702045a26fb.png") !important; }

/* 王铠盖欧露易丝 特殊形态 */
[data-char*="王铠盖欧露易丝"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/aca05cddbcaec8447b1792d28b4c423057e36d89f349e629.png") !important; }
[data-char*="王铠盖欧露易丝"][data-action*="脸红"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/eb9f48183ae9df6ac3ae0588608daed6fd4d7b63ae8ea610.png") !important; }
[data-char*="王铠盖欧露易丝"][data-action="通常"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/aca05cddbcaec8447b1792d28b4c423057e36d89f349e629.png") !important; }
[data-char*="王铠盖欧露易丝"][data-action="脸红通常"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/eb9f48183ae9df6ac3ae0588608daed6fd4d7b63ae8ea610.png") !important; }
[data-char*="王铠盖欧露易丝"][data-action="害羞"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/175f86a760912b492d1484d5f2b2a1b8a06ca6d43dde48cc.png") !important; }
[data-char*="王铠盖欧露易丝"][data-action="惊讶"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/dda75e5431dbfd0cc68ee6fb964a38f0db03c74c188820d4.png") !important; }
[data-char*="王铠盖欧露易丝"][data-action="脸红惊讶"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/c1c74a8276a418d42bf59a566dea6dcd88a0c11a6c5a2b20.png") !important; }
[data-char*="王铠盖欧露易丝"][data-action="高兴"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/94f378a556387c066f9e0e6b271de7702b878be7811ee5a6.png") !important; }
[data-char*="王铠盖欧露易丝"][data-action="脸红高兴"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/da6671afdfa1e82b09ea95f331bb2f1c9a595ca56d49d075.png") !important; }
[data-char*="王铠盖欧露易丝"][data-action="难过"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/dcbbcdf7ec5fa4cf285eec3c9e2f8ddbad621827c6cebba6.png") !important; }
[data-char*="王铠盖欧露易丝"][data-action="脸红难过"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/44ac406584109d284a0e44f9eb220c592a1a76ad8b8e7c9f.png") !important; }
[data-char*="王铠盖欧露易丝"][data-action="疑惑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/4b3d6f774bca779ab74e346792f7149779011342d7ca7d8e.png") !important; }
[data-char*="王铠盖欧露易丝"][data-action="脸红疑惑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/586263ced2fac84294c59434c320f354c41ad0ba1e7d147b.png") !important; }
[data-char*="王铠盖欧露易丝"][data-action="生气"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/0c135a359dc112d0b305c9546dae330dc81b9a9309b0cc26.png") !important; }
[data-char*="王铠盖欧露易丝"][data-action="脸红生气"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/757193069b187f3c268a30faac5bdad4baa6a4579d2bebb4.png") !important; }
[data-char*="王铠盖欧露易丝"][data-action="皱眉"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/d75383a8efb3137c55746f00f87462cd11d2e5f34f942fbc.png") !important; }
[data-char*="王铠盖欧露易丝"][data-action="脸红皱眉"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/e05a70d424c42b2aa1d6103b963492945907fb3c3e5c1de8.png") !important; }
[data-char*="王铠盖欧露易丝"][data-action="思考"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/0829e245da81cfe5a8574558b40cc32d3d819078ecb47258.png") !important; }
[data-char*="王铠盖欧露易丝"][data-action="脸红思考"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/1d5bf642733994e79d7cb6d3cc72c089c6128b7e3452c01e.png") !important; }

/* --- 古伊奈 --- */
[data-char*="古伊奈"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/b6bfaa8e95ac22b482fef2f25949aa7e32c4ce6dbc25df7a.png") !important; }
[data-char*="古伊奈"][data-action*="脸红"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/ef44f14d73845b01d4f704bfd8f377b73b985356aa1f3c46.png") !important; }
[data-char*="古伊奈"][data-action="通常"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/b6bfaa8e95ac22b482fef2f25949aa7e32c4ce6dbc25df7a.png") !important; }
[data-char*="古伊奈"][data-action="脸红通常"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/ef44f14d73845b01d4f704bfd8f377b73b985356aa1f3c46.png") !important; }
[data-char*="古伊奈"][data-action="害羞"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/fe3d3231728c4c689207349720317927b83d9953f45e45ca.png") !important; }
[data-char*="古伊奈"][data-action="惊讶"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/825f06ae962aff8816bdc8294d0798926afd5cf65c6b0d2c.png") !important; }
[data-char*="古伊奈"][data-action="脸红惊讶"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/8a973ad843eff3b76d233c54412cca9980f36b9f6f57ef66.png") !important; }
[data-char*="古伊奈"][data-action="高兴"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/639bea2bb36e374ac227f4f00dfb7681952151d8992ab9de.png") !important; }
[data-char*="古伊奈"][data-action="脸红高兴"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/c443dac024bb2da115dc8c6126f9646855e6d04732c7cd4b.png") !important; }
[data-char*="古伊奈"][data-action="疑惑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/27e47af5fec5a561fe70dbac0f2e6f6b45641cca0e94a8e3.png") !important; }
[data-char*="古伊奈"][data-action="脸红疑惑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/5c0a9dd345d7993e2e8b3cde23368e8f071a1f734c74566c.png") !important; }
[data-char*="古伊奈"][data-action="生气"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/8827cf20a8068fc7dc517ce4e4563245f0165bc4f35cafa9.png") !important; }
[data-char*="古伊奈"][data-action="脸红生气"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/e693bca644249218a750bb9671750ab4afff097e13bb6b8c.png") !important; }
[data-char*="古伊奈"][data-action="思考"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/e49723775612c729adbfcacb16a567eb69e3d0cb4faa0547.png") !important; }
[data-char*="古伊奈"][data-action="脸红思考"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/087b3917b100f98c85af28fa0afafe4adcd5fb8c87af468e.png") !important; }

/* 王铠古伊奈 特殊形态 */
[data-char*="王铠古伊奈"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/c6536c8000938d0d02b3617978257fb2b9c078eb32f9a45a.png") !important; }
[data-char*="王铠古伊奈"][data-action*="脸红"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/13176b87d493ff800374d3456245bb664a17f112d4003abb.png") !important; }
[data-char*="王铠古伊奈"][data-action="通常"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/c6536c8000938d0d02b3617978257fb2b9c078eb32f9a45a.png") !important; }
[data-char*="王铠古伊奈"][data-action="脸红通常"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/13176b87d493ff800374d3456245bb664a17f112d4003abb.png") !important; }
[data-char*="王铠古伊奈"][data-action="害羞"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/13176b87d493ff800374d3456245bb664a17f112d4003abb.png") !important; }
[data-char*="王铠古伊奈"][data-action="惊讶"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/b19616f420407c684ed29ac5e67137b3d282a3723fc33979.png") !important; }
[data-char*="王铠古伊奈"][data-action="脸红惊讶"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/c48a9c0d763f5c0fc662dc9f37d2ea17481b85bb88b3facf.png") !important; }
[data-char*="王铠古伊奈"][data-action="高兴"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/ebb678bf32ddeb0d428a2e51863740d58c4f2cecf3e65e32.png") !important; }
[data-char*="王铠古伊奈"][data-action="脸红高兴"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/f63556f8b8f3e5e050c651008736e9668f4f66fa988579d5.png") !important; }
[data-char*="王铠古伊奈"][data-action="难过"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/863a02f354232d2c9c61d83a894ba6eb52ab711d6e2b448d.png") !important; }
[data-char*="王铠古伊奈"][data-action="脸红难过"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/a7c4087450dc21b056f5158e3959987a323a96cfbef8f06e.png") !important; }
[data-char*="王铠古伊奈"][data-action="疑惑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/98b771e822d7ec14d6dbca09bebf6534be8a19c1c7ebcebd.png") !important; }
[data-char*="王铠古伊奈"][data-action="脸红疑惑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/8a26fcbb543e1496d1e264e4afd6d10dbe9ad8fbbfb530dd.png") !important; }
[data-char*="王铠古伊奈"][data-action="生气"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/257be11ec28fe777afa6503077a31f96f25c589e169b02b7.png") !important; }
[data-char*="王铠古伊奈"][data-action="脸红生气"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/6dce23785def0c078b0dcd26f18769dffb82bfbf31602507.png") !important; }
[data-char*="王铠古伊奈"][data-action="皱眉"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/ba0cab04565c06ad7ac651b01a57100da9bb4a7345aff993.png") !important; }
[data-char*="王铠古伊奈"][data-action="脸红皱眉"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/200125972c0b60e953540e8cc2411534d9f36672a0a7cea3.png") !important; }
[data-char*="王铠古伊奈"][data-action="思考"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/d833f7d5d0daf22176b82474e9839b8167b394095be2ef2d.png") !important; }
[data-char*="王铠古伊奈"][data-action="脸红思考"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/332deb96d8e0dc1f8e4b5360686f97f1751882c247729c2e.png") !important; }

/* --- 斯提亚拉 --- */
[data-char*="斯提亚拉"] .custom-nvn-avatar-img, [data-char*="提亚拉"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/b3b47ee8648ac6c5930081c384263903867ff6907683f228.png") !important; }
[data-char*="斯提亚拉"][data-action*="脸红"] .custom-nvn-avatar-img, [data-char*="提亚拉"][data-action*="脸红"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/0f047f08e5625c317b0b90d75d10dbeaa8e3f318c8987cb9.png") !important; }
[data-char*="斯提亚拉"][data-action="通常"] .custom-nvn-avatar-img, [data-char*="提亚拉"][data-action="通常"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/b3b47ee8648ac6c5930081c384263903867ff6907683f228.png") !important; }
[data-char*="斯提亚拉"][data-action="脸红通常"] .custom-nvn-avatar-img, [data-char*="提亚拉"][data-action="脸红通常"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/0f047f08e5625c317b0b90d75d10dbeaa8e3f318c8987cb9.png") !important; }
[data-char*="斯提亚拉"][data-action="得意"] .custom-nvn-avatar-img, [data-char*="提亚拉"][data-action="得意"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/a300eed081c0acce08c06a5bde59630219a0039677cba1ce.png") !important; }
[data-char*="斯提亚拉"][data-action="脸红得意"] .custom-nvn-avatar-img, [data-char*="提亚拉"][data-action="脸红得意"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/b09551f18b5b3b3f9899fb95ec3b8a670a58b184a3229359.png") !important; }
[data-char*="斯提亚拉"][data-action="脸红腹黑笑"] .custom-nvn-avatar-img, [data-char*="提亚拉"][data-action="脸红腹黑笑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/e57e17329d0d72514177bfb0e7efe0cdaf384b5ef934dff3.png") !important; }
[data-char*="斯提亚拉"][data-action="害羞"] .custom-nvn-avatar-img, [data-char*="提亚拉"][data-action="害羞"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/b606ead18a7ea2d0a47c2438bd6ee49f15a826cada69e6b6.png") !important; }
[data-char*="斯提亚拉"][data-action="难过"] .custom-nvn-avatar-img, [data-char*="提亚拉"][data-action="难过"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/682107a0eed92f0d142f30c323c214b6a2f56a4e1e4c4410.png") !important; }
[data-char*="斯提亚拉"][data-action="脸红难过"] .custom-nvn-avatar-img, [data-char*="提亚拉"][data-action="脸红难过"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/893c0d0d7e87dd1c45e4fa992af75120b156fd86cc2f7d1e.png") !important; }
[data-char*="斯提亚拉"][data-action="疑惑"] .custom-nvn-avatar-img, [data-char*="提亚拉"][data-action="疑惑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/e2a8e41600cf16a6252f8b839e28085bd3b2dbeeb7a15248.png") !important; }
[data-char*="斯提亚拉"][data-action="脸红疑惑"] .custom-nvn-avatar-img, [data-char*="提亚拉"][data-action="脸红疑惑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/02d1657536ccff64a38ceca6a9d2a13ec3427478b87532d7.png") !important; }
[data-char*="斯提亚拉"][data-action="生气"] .custom-nvn-avatar-img, [data-char*="提亚拉"][data-action="生气"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/fafb11ae70be489faa85a4dc3ab90ef8db2c4837a3165959.png") !important; }
[data-char*="斯提亚拉"][data-action="脸红生气"] .custom-nvn-avatar-img, [data-char*="提亚拉"][data-action="脸红生气"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/fa13a02ea03c99b4f8259967f660b0b8015cfc2f3e3d630d.png") !important; }
[data-char*="斯提亚拉"][data-action="皱眉"] .custom-nvn-avatar-img, [data-char*="提亚拉"][data-action="皱眉"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/371b9a66145afd235b135256ffd0654877e76804c17e5657.png") !important; }
[data-char*="斯提亚拉"][data-action="脸红皱眉"] .custom-nvn-avatar-img, [data-char*="提亚拉"][data-action="脸红皱眉"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/e109e67d39ac5efc682638a72846d6e174cf61ce807e7597.png") !important; }
[data-char*="斯提亚拉"][data-action="思考"] .custom-nvn-avatar-img, [data-char*="提亚拉"][data-action="思考"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/8fb21481b21adca51ca1e9d2931241841a8a3797c4a08b64.png") !important; }
[data-char*="斯提亚拉"][data-action="脸红思考"] .custom-nvn-avatar-img, [data-char*="提亚拉"][data-action="脸红思考"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/2d17cf8998a1e89506a3e8771881bca995bab4d70448f849.png") !important; }

/* =========================================================================
 * 🌟 新增角色表情差分映射
 * ========================================================================= */
/* --- 艾尔希（非IV形态） --- */
[data-char*="艾尔希"]:not([data-char*="IV"]) .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/37b20dcdd51edc1af6a386bbab63d98760b6124e5ca6c745.png") !important; }
[data-char*="艾尔希"]:not([data-char*="IV"])[data-action*="脸红"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/85f028be9e388449aef3c315b00622a5c0e2e8fa00b80c3e.png") !important; }
[data-char*="艾尔希"]:not([data-char*="IV"])[data-action="通常"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/37b20dcdd51edc1af6a386bbab63d98760b6124e5ca6c745.png") !important; }
[data-char*="艾尔希"]:not([data-char*="IV"])[data-action="脸红通常"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/85f028be9e388449aef3c315b00622a5c0e2e8fa00b80c3e.png") !important; }
[data-char*="艾尔希"]:not([data-char*="IV"])[data-action="得意"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/65912b25b5168560dd308c5439688d0e5acb6b8d11526fda.png") !important; }
[data-char*="艾尔希"]:not([data-char*="IV"])[data-action="脸红得意"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/3d179784805d34f9f8dfb5133818504988555e526bdf7e7b.png") !important; }
[data-char*="艾尔希"]:not([data-char*="IV"])[data-action="腹黑笑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/cc76429b32b39ba9ac956416530885d34230eb565189dbaf.png") !important; }
[data-char*="艾尔希"]:not([data-char*="IV"])[data-action="脸红腹黑笑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/dabd88a68e72961cd6c5d680a386d543410dcdae509717ba.png") !important; }
[data-char*="艾尔希"]:not([data-char*="IV"])[data-action="害羞"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/224f9339288d816637c8fe66f7d5e80e8124be9d40068d77.png") !important; }
[data-char*="艾尔希"]:not([data-char*="IV"])[data-action="惊讶"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/2faee8909b398f0192e444ac8c90e6da4db1032a3ac553f2.png") !important; }
[data-char*="艾尔希"]:not([data-char*="IV"])[data-action="脸红惊讶"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/3a323b5c5bea7c751c9cab654e7d6de37ed9acf2b43647f9.png") !important; }
[data-char*="艾尔希"]:not([data-char*="IV"])[data-action="高兴"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/1234e92dee85ea0dec007ddf7bdd2a57d2f1cc04004a328d.png") !important; }
[data-char*="艾尔希"]:not([data-char*="IV"])[data-action="脸红高兴"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/b7337f157c90692d53b6d4c9370fba4c9aa8a47321ee51f2.png") !important; }
[data-char*="艾尔希"]:not([data-char*="IV"])[data-action="难过"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/8b5557eebdecf3e4086df558bcca50d5ac16233d300308d3.png") !important; }
[data-char*="艾尔希"]:not([data-char*="IV"])[data-action="脸红难过"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/7ac25bd232e6010002b2d3d67102d00a06cd56971fe003bc.png") !important; }
[data-char*="艾尔希"]:not([data-char*="IV"])[data-action="疑惑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/fcc9072a0f7ead7dafec6bb3513cd012ba6d49f1c340bda5.png") !important; }
[data-char*="艾尔希"]:not([data-char*="IV"])[data-action="脸红疑惑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/974bffcaf31efa5809b0720ddefafe077f87b85eaee489bc.png") !important; }
[data-char*="艾尔希"]:not([data-char*="IV"])[data-action="生气"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/a90104e156f1e377310737711203e0110205bc3e3a1b7e3b.png") !important; }
[data-char*="艾尔希"]:not([data-char*="IV"])[data-action="脸红生气"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/6f561f1854fbc581562f6caec311f87cf4ad71ee5775912d.png") !important; }

/* --- 艾尔希IV --- */
[data-char*="艾尔希IV"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/4b27857c130b16f44741200c2c09a68fadf3e2ff211d37b1.png") !important; }
[data-char*="艾尔希IV"][data-action*="脸红"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/566d2fa85168ee56664204b545ef31c7b3f62c76fd2bc723.png") !important; }
[data-char*="艾尔希IV"][data-action="通常"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/4b27857c130b16f44741200c2c09a68fadf3e2ff211d37b1.png") !important; }
[data-char*="艾尔希IV"][data-action="脸红通常"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/566d2fa85168ee56664204b545ef31c7b3f62c76fd2bc723.png") !important; }
[data-char*="艾尔希IV"][data-action="得意"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/1f02a7fa646433cf1e1920a8d976bb41fc13d49e49b44131.png") !important; }
[data-char*="艾尔希IV"][data-action="脸红得意"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/001209b0635444d158e43c12bbfe1b9e307bcb328bb58288.png") !important; }
[data-char*="艾尔希IV"][data-action="腹黑笑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/3df3abda9fb93c74598fa9ba03f500ba9be9753efcb73282.png") !important; }
[data-char*="艾尔希IV"][data-action="脸红腹黑笑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/2ac70408988a1d8477af80cf5cc85951b00004d48e83d857.png") !important; }
[data-char*="艾尔希IV"][data-action="害羞"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/e36da7a3eebf4107b2d35378474877001d2714a6cf01c0d7.png") !important; }
[data-char*="艾尔希IV"][data-action="惊讶"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/85a3e1532ae262aa8cc2a914c4ac40c6f5fec772511fd52e.png") !important; }
[data-char*="艾尔希IV"][data-action="脸红惊讶"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/8416f64afb2e9c3e506069f946998942ef1a02d30ea945e8.png") !important; }
[data-char*="艾尔希IV"][data-action="高兴"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/3bfb2f1fb615a3c00a6d35cbbd7341a346bb1db5ed56cd03.png") !important; }
[data-char*="艾尔希IV"][data-action="脸红高兴"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/59997c3cfa24c5a0348c63bb6ebb6d6f962bdfeb7b18c2a4.png") !important; }
[data-char*="艾尔希IV"][data-action="难过"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/2ba96354d9215e0f80159eb84dcf21328af33a392fa899a7.png") !important; }
[data-char*="艾尔希IV"][data-action="脸红难过"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/e2e73512540769975ba1355ea6739e55b297abb4740e1e19.png") !important; }
[data-char*="艾尔希IV"][data-action="疑惑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/10560b6575aef38fe9c8c7345440f454c32a3667157a70ad.png") !important; }
[data-char*="艾尔希IV"][data-action="脸红疑惑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/1054effb57404ba3a8a6b1f120a0216165b1c8406962d551.png") !important; }
[data-char*="艾尔希IV"][data-action="生气"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/701b3039eb79c36b7a52047dc1309633419fbde611d045c5.png") !important; }
[data-char*="艾尔希IV"][data-action="脸红生气"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/8215364816a1f9005b106f6ea3f77ceccfc88768bd96cc69.png") !important; }

/* --- 狄娜 --- */
[data-char*="狄娜"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/1dadf45d3588c9cfec1d46185611170cc753da727fa980a1.png") !important; }
[data-char*="狄娜"][data-action*="脸红"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/c770fac4a487e015bdb9cc6bde706bf6892c38f99e21e3ad.png") !important; }
[data-char*="狄娜"][data-action="通常"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/1dadf45d3588c9cfec1d46185611170cc753da727fa980a1.png") !important; }
[data-char*="狄娜"][data-action="脸红通常"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/c770fac4a487e015bdb9cc6bde706bf6892c38f99e21e3ad.png") !important; }
[data-char*="狄娜"][data-action="害羞"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/b01bc9840d3fd7f24118816f12e90039b080711e4ca9f2c4.png") !important; }
[data-char*="狄娜"][data-action="高兴"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/60b50f9b7a4f7f577eb7f1ba0a488c4970662223902c01dc.png") !important; }
[data-char*="狄娜"][data-action="脸红高兴"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/4fbc84e3ade88eefa9e72442e144af098d38bebecebeb156.png") !important; }
[data-char*="狄娜"][data-action="难过"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/b2921af6471fafc2781f4f43e4b3e8ee3b3e61c3cb85fe3a.png") !important; }
[data-char*="狄娜"][data-action="脸红难过"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/722ab7a0e009eaaa40dea22f6bcd4fdb29202c2fe1b833f7.png") !important; }
[data-char*="狄娜"][data-action="疑惑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/1fffca2187a0bfb88f953df33b292ddb7e84a509d4d76318.png") !important; }
[data-char*="狄娜"][data-action="脸红疑惑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/73c93d43abd97fe98132203323acdc071adfe655038855ea.png") !important; }
[data-char*="狄娜"][data-action="生气"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/ac995f2437a82eab4da201f7334b88288702601277b1a36d.png") !important; }
[data-char*="狄娜"][data-action="脸红生气"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/c88c7a3397f1d6ba878d70ab4c6a642f4f66de9533b4a96a.png") !important; }
[data-char*="狄娜"][data-action="皱眉"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/4f9cd0122aaa34c3f9b1d971fb317e2fd1282555ef371970.png") !important; }
[data-char*="狄娜"][data-action="脸红皱眉"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/09883883287f59e3f751d29869acbcc9cc7eeea9749eab7f.png") !important; }
[data-char*="狄娜"][data-action="思考"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/580577d2cad01770fba088dd88193fc04c82968db96736a3.png") !important; }
[data-char*="狄娜"][data-action="脸红思考"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/577a958a074fbfd3024c660fed097ebda9efcf9cb4cd1ac2.png") !important; }

/* --- 卡莲 --- */
[data-char*="卡莲"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/f42a78c5c131cbc403c3be55402bb41d33586ace93d01d27.png") !important; }
[data-char*="卡莲"][data-action*="脸红"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/66544dfdef89acb53431ec35d054ed9be67609268399dad0.png") !important; }
[data-char*="卡莲"][data-action="通常"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/f42a78c5c131cbc403c3be55402bb41d33586ace93d01d27.png") !important; }
[data-char*="卡莲"][data-action="脸红通常"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/66544dfdef89acb53431ec35d054ed9be67609268399dad0.png") !important; }
[data-char*="卡莲"][data-action="害羞"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/2e97a412dcd4d2541cf3a99bfe3e1e99948968fdcd24cc9d.png") !important; }
[data-char*="卡莲"][data-action="惊讶"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/e37206253e3091b87ee5f19996dc4778ae7b992f586eeeab.png") !important; }
[data-char*="卡莲"][data-action="脸红惊讶"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/e0efdd6d72a01d2c4a6fb482fd14d482a158e757a903bd6c.png") !important; }
[data-char*="卡莲"][data-action="难过"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/94433bb53a241058910eabf5e091129f8f9e31cf2482fc0c.png") !important; }
[data-char*="卡莲"][data-action="脸红难过"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/eea684f2d6c974e7d45c3930dc7307ff250eae201dfd6650.png") !important; }
[data-char*="卡莲"][data-action="疑惑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/862beb527ae474e90a0eea775a88f7773c1ce68e96814663.png") !important; }
[data-char*="卡莲"][data-action="脸红疑惑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/ba6f0be3175da241ac8670c45d6ddacc5549688f93b3f4e1.png") !important; }
[data-char*="卡莲"][data-action="生气"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/e224d19888481c461d45c0ad0d659889e54496469ff27a8f.png") !important; }
[data-char*="卡莲"][data-action="脸红生气"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/e2b38879f9263569f4371d091ba0b74fe80fc250098c37fb.png") !important; }
[data-char*="卡莲"][data-action="思考"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/fac71b6b280ed66b5c642eadd30d38dc9f9e4883c9e3d378.png") !important; }
[data-char*="卡莲"][data-action="脸红思考"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/9b075b8ffb69c2c39b02a6e9abbc1e511dd514335c7185a9.png") !important; }

/* --- 柯萝特 --- */
[data-char*="柯萝特"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/48f0e97d0043fe4bb899f512a032bb302b834aeb8c44d345.png") !important; }
[data-char*="柯萝特"][data-action*="脸红"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/4d1489787890e682d12a73d3bd5414a40346e8a2d7c8afca.png") !important; }
[data-char*="柯萝特"][data-action="通常"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/48f0e97d0043fe4bb899f512a032bb302b834aeb8c44d345.png") !important; }
[data-char*="柯萝特"][data-action="脸红通常"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/4d1489787890e682d12a73d3bd5414a40346e8a2d7c8afca.png") !important; }
[data-char*="柯萝特"][data-action="害羞"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/4d1489787890e682d12a73d3bd5414a40346e8a2d7c8afca.png") !important; }
[data-char*="柯萝特"][data-action="惊讶"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/0b6bd8935e8bcdc9de8c5630507174dc654f1f8466c4c4ea.png") !important; }
[data-char*="柯萝特"][data-action="脸红惊讶"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/fe24b8f032e6509bc60ac1a932cbeb09ecc9dc00bf4455df.png") !important; }
[data-char*="柯萝特"][data-action="高兴"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/8a70c405675fbac537159d0d8b3021810ea4985778c023c0.png") !important; }
[data-char*="柯萝特"][data-action="脸红高兴"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/ce5bf7eb6016c466420f5138719d723da0c02457c22934d6.png") !important; }
[data-char*="柯萝特"][data-action="难过"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/01e6791976b1ea0f6dfd3275207652017f1b348d89fcfd9d.png") !important; }
[data-char*="柯萝特"][data-action="脸红难过"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/118d5d45a8ea122125844a5642650b533dc3f9564849e4c6.png") !important; }
[data-char*="柯萝特"][data-action="疑惑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/6c6aa49b43df7afb708d777f80fc6e2cc8e7e719d29e7d55.png") !important; }
[data-char*="柯萝特"][data-action="脸红疑惑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/8961919333912dff35cb4de243fc3b1a8f88edd552fd3243.png") !important; }
[data-char*="柯萝特"][data-action="生气"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/e73620423545e84a77d54ee583118e37e9a23bca4924a830.png") !important; }
[data-char*="柯萝特"][data-action="脸红生气"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/4b2f49ed9df6627e07e4267f5acf3a232ac1acdc129de124.png") !important; }
/* --- 托莉娜（非魔化） --- */
[data-char*="托莉娜"]:not([data-char*="魔化"]) .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/02/baf1073fccd03e0d73215a07dc7621448d075e160cd34497.png") !important; }
[data-char*="托莉娜"]:not([data-char*="魔化"])[data-action*="脸红"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/02/299739dcdea7d2bc4725efcd849fdae0aabb9588d6a72a2e.png") !important; }
[data-char*="托莉娜"]:not([data-char*="魔化"])[data-action="通常"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/02/baf1073fccd03e0d73215a07dc7621448d075e160cd34497.png") !important; }
[data-char*="托莉娜"]:not([data-char*="魔化"])[data-action="脸红通常"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/02/299739dcdea7d2bc4725efcd849fdae0aabb9588d6a72a2e.png") !important; }
[data-char*="托莉娜"]:not([data-char*="魔化"])[data-action="得意"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/02/f7be1fb744f75e5f95f3a530dd4b3782d891b304a20d4066.png") !important; }
[data-char*="托莉娜"]:not([data-char*="魔化"])[data-action="脸红得意"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/02/ae670ff6a6edf4a121b8fc65fcd53a2d35a0ad9d81813e53.png") !important; }
[data-char*="托莉娜"]:not([data-char*="魔化"])[data-action="腹黑笑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/02/bc8feaa2f1650dc4478063bb8dfdb1575376dab630006b8b.png") !important; }
[data-char*="托莉娜"]:not([data-char*="魔化"])[data-action="脸红腹黑笑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/02/bebaca0840fe6ccb6ba72f27ae2cf95f73b4395504f86d2a.png") !important; }
[data-char*="托莉娜"]:not([data-char*="魔化"])[data-action="害羞"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/02/db9feab4694e58c6eee0522fafb68a05c19cc77628188049.png") !important; }
[data-char*="托莉娜"]:not([data-char*="魔化"])[data-action="惊讶"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/02/7eea1a84d1532f8c40f2ae9c01a5b4885a4cad51e815b3ac.png") !important; }
[data-char*="托莉娜"]:not([data-char*="魔化"])[data-action="脸红惊讶"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/02/b76da647f5e6f17177eccdeb6f2dce97e0fdd4499dd65011.png") !important; }
[data-char*="托莉娜"]:not([data-char*="魔化"])[data-action="高兴"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/02/c3cc7128f0792769a5355923be3069f6456abfb94e779af8.png") !important; }
[data-char*="托莉娜"]:not([data-char*="魔化"])[data-action="脸红高兴"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/02/6ae91c018ed2f2c40ec670578a946fe0806d98794cd00844.png") !important; }
[data-char*="托莉娜"]:not([data-char*="魔化"])[data-action="难过"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/02/6db176aaac1799586cf48b8591a77349a15c4039c3a78c70.png") !important; }
[data-char*="托莉娜"]:not([data-char*="魔化"])[data-action="脸红难过"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/02/b1ff45960712b3b9cff6f897b9399e1be9539bc25c968f34.png") !important; }
[data-char*="托莉娜"]:not([data-char*="魔化"])[data-action="疑惑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/02/af767b08c9a52d5e3bb9501fdb8c9f5cdb17ac672e73a122.png") !important; }
[data-char*="托莉娜"]:not([data-char*="魔化"])[data-action="脸红疑惑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/02/f08f27f2a389b5e2467ec61b3cc5df51894c11acb6593b61.png") !important; }
[data-char*="托莉娜"]:not([data-char*="魔化"])[data-action="生气"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/02/307d1580628281236bb8bf415714216adcf64894bc596580.png") !important; }
[data-char*="托莉娜"]:not([data-char*="魔化"])[data-action="脸红生气"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/02/053ab5c737903017db9aa763225e68b5088256639e2414b4.png") !important; }
[data-char*="托莉娜"]:not([data-char*="魔化"])[data-action="皱眉"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/02/a5c073b1575343951b3076e2d29e24d0e386f48810a10a9f.png") !important; }
[data-char*="托莉娜"]:not([data-char*="魔化"])[data-action="脸红皱眉"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/02/eaa05a29df4daeda5960328ab873574690156436e6f43580.png") !important; }
[data-char*="托莉娜"]:not([data-char*="魔化"])[data-action="思考"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/02/a7af863d7e3c2e7bd9a32ebab167247f23cc220780fec153.png") !important; }
[data-char*="托莉娜"]:not([data-char*="魔化"])[data-action="脸红思考"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/02/99405da3d05603fe876092a97731251a51579a3d122c0477.png") !important; }

/* --- 魔化托莉娜 --- */
[data-char*="魔化托莉娜"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/02/96242e499f06db45ed4c32f2b282a0be664e6cca44cd8dca.png") !important; }
[data-char*="魔化托莉娜"][data-action*="脸红"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/02/091b1ce9b8d9abdc687b3cc4841c710c3e2d2f4b6df4cb6f.png") !important; }
[data-char*="魔化托莉娜"][data-action="通常"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/02/96242e499f06db45ed4c32f2b282a0be664e6cca44cd8dca.png") !important; }
[data-char*="魔化托莉娜"][data-action="脸红通常"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/02/091b1ce9b8d9abdc687b3cc4841c710c3e2d2f4b6df4cb6f.png") !important; }
[data-char*="魔化托莉娜"][data-action="得意"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/02/e5417a69241effcd5a956b94612b7c1c1ccd22964e02d33b.png") !important; }
[data-char*="魔化托莉娜"][data-action="脸红得意"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/02/b4a5b4e0bcc7182997973a9d2e3991832d35342057b42b5a.png") !important; }
[data-char*="魔化托莉娜"][data-action="腹黑笑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/02/eadb03e64018e3b659760992853e1574d3ee830dc11fc5e6.png") !important; }
[data-char*="魔化托莉娜"][data-action="脸红腹黑笑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/02/96964e62d3bf38d7f93b705073f479bda13c5e6536b39392.png") !important; }
[data-char*="魔化托莉娜"][data-action="害羞"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/02/78f84f2dfcbf44290bfc2cee131200f79c60a5ed2fb39310.png") !important; }
[data-char*="魔化托莉娜"][data-action="惊讶"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/02/2ca26f2a99f8d479540bcc3b5b1f41f2ca7a54ee8420e83c.png") !important; }
[data-char*="魔化托莉娜"][data-action="脸红惊讶"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/02/777be016a255ea82f36de741f2f08e4c0520a316a2e02bf5.png") !important; }
[data-char*="魔化托莉娜"][data-action="高兴"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/02/a59344ba7c8f0e1df6e8debafaa3cca8673acaf46b6f424c.png") !important; }
[data-char*="魔化托莉娜"][data-action="脸红高兴"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/02/72d22ba1a3e96bfae13687fae5e56f68bfce09e860579710.png") !important; }
[data-char*="魔化托莉娜"][data-action="难过"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/02/5c9bba9aaec8af4d9524da33998b733c12fb8964f2d7e5fe.png") !important; }
[data-char*="魔化托莉娜"][data-action="脸红难过"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/02/78f84f2dfcbf44290bfc2cee131200f79c60a5ed2fb39310.png") !important; }
[data-char*="魔化托莉娜"][data-action="疑惑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/02/8717bd29acb04f330f79725b056cb1b5d98da14a9294166a.png") !important; }
[data-char*="魔化托莉娜"][data-action="脸红疑惑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/02/0444c4b1b32025fed389d59d59d2e31af5e7de2a04342dc3.png") !important; }
[data-char*="魔化托莉娜"][data-action="生气"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/02/a7e5fe291031f3c71ea4432e6457ea0422050f916d980b51.png") !important; }
[data-char*="魔化托莉娜"][data-action="脸红生气"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/02/6124f3508370a9db35b4fa49c69ca01ee1563dff799aab7d.png") !important; }
[data-char*="魔化托莉娜"][data-action="皱眉"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/02/16854a7dfede75a82a8132686c12c5b8d5f27aa1134e37c6.png") !important; }
[data-char*="魔化托莉娜"][data-action="脸红皱眉"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/02/517557917e35c8a54f608f792cc0b0855be9ddedc30a1ffc.png") !important; }
[data-char*="魔化托莉娜"][data-action="思考"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/02/1e7fd2b48e4c4efbbe6a29d41bd8efd5bb0febd059da662b.png") !important; }
[data-char*="魔化托莉娜"][data-action="脸红思考"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/02/f9929351b455a0304f627b37a49e8c9d1fa906a6cbfc85bf.png") !important; }

/* --- 一之濑雫 / 雫 --- */
div.custom-nvn-dialogue:is([data-char*="一之濑雫"], ) .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/02/13bcc39120a81f21da53e7602f9fb44be44c3589799d5a5c.png") !important; }
div.custom-nvn-dialogue:is([data-char*="一之濑雫"], )[data-action*="脸红"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/02/4b239bc073875aef5326c9d1e0d0c4a1ee7baace45c60693.png") !important; }
div.custom-nvn-dialogue:is([data-char*="一之濑雫"], )[data-action="通常"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/02/13bcc39120a81f21da53e7602f9fb44be44c3589799d5a5c.png") !important; }
div.custom-nvn-dialogue:is([data-char*="一之濑雫"], )[data-action="脸红通常"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/02/4b239bc073875aef5326c9d1e0d0c4a1ee7baace45c60693.png") !important; }
div.custom-nvn-dialogue:is([data-char*="一之濑雫"], )[data-action="得意"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/02/09e26bced46e30d238f6984b626886c2bc09133743761b6c.png") !important; }
div.custom-nvn-dialogue:is([data-char*="一之濑雫"], )[data-action="脸红得意"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/02/5dbfa091a61d2bb085d80aa2e533c1de99a26b13f6ae5a74.png") !important; }
div.custom-nvn-dialogue:is([data-char*="一之濑雫"], )[data-action="惊讶"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/02/bcfa3d9a0704c752b7831fde035c8a5415871ad245e3bede.png") !important; }
div.custom-nvn-dialogue:is([data-char*="一之濑雫"], )[data-action="脸红惊讶"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/02/31f6ab4b8cc959d533a980e09ee2180ef753b4c544c86058.png") !important; }
div.custom-nvn-dialogue:is([data-char*="一之濑雫"], )[data-action="高兴"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/02/041b001eb884aa12b5a6d75225fe246d867ddfc51ff4cbc1.png") !important; }
div.custom-nvn-dialogue:is([data-char*="一之濑雫"], )[data-action="脸红高兴"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/02/cd59b86e6bbbe23bb9be7e17ecd97d8cb7a78ff84194fce8.png") !important; }
div.custom-nvn-dialogue:is([data-char*="一之濑雫"], )[data-action="难过"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/02/1578f5cc3a5ed39f4808cae1f7dab4e38dcd5cc8fd06d60e.png") !important; }
div.custom-nvn-dialogue:is([data-char*="一之濑雫"], )[data-action="脸红难过"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/02/6c41535ce1b1b6ee525a4fb24ba4a0bff6b69ff0d128c154.png") !important; }
div.custom-nvn-dialogue:is([data-char*="一之濑雫"], )[data-action="疑惑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/02/3aae8af8ee178147ff154a7864a49893cc9aca1bda92c641.png") !important; }
div.custom-nvn-dialogue:is([data-char*="一之濑雫"], )[data-action="脸红疑惑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/02/170b67c64cc65605fef822d807ac412adb19b0a78c06fa18.png") !important; }
div.custom-nvn-dialogue:is([data-char*="一之濑雫"], )[data-action="生气"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/02/77c33be9a76812b4a21d3e0b5d839ec729000848790ec2ea.png") !important; }
div.custom-nvn-dialogue:is([data-char*="一之濑雫"], )[data-action="脸红生气"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/02/df26f28a473ef7bb2b578813ce463c7a85877b0eb75e52ec.png") !important; }
div.custom-nvn-dialogue:is([data-char*="一之濑雫"], )[data-action="皱眉"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/02/6e45c3fc43f53acf2e81b12d04267548a237a427ca49fc97.png") !important; }
div.custom-nvn-dialogue:is([data-char*="一之濑雫"], )[data-action="脸红皱眉"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/02/2bbc4a6ff0d208945286f8f46ec703efd56db0f91171ce3a.png") !important; }
/* =========================================================================
 * 🌟 纯透明全屏居中大立绘映射
 * ========================================================================= */
.custom-nvn-avatar-popover .custom-nvn-modal-content { display: none !important; }

.custom-nvn-avatar-popover[open] summary::before {
  content: "" !important;
  position: fixed !important;
  inset: 0 !important;
  width: 100vw !important;
  height: 100vh !important;
  z-index: 2147483640 !important;
  background: transparent !important;
  cursor: pointer !important;
  display: block !important;
}

.custom-nvn-avatar-popover[open] .custom-nvn-modal-content {
  position: fixed !important;
  inset: 0 !important;
  width: 100vw !important;
  height: 100vh !important;
  z-index: 2147483641 !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  pointer-events: none !important;
}

.custom-nvn-portrait-full {
  max-width: 88vw !important;
  max-height: 88vh !important;
  width: auto !important;
  height: auto !important;
  object-fit: contain !important;
  filter: drop-shadow(0 10px 30px rgba(0, 0, 0, 0.85)) !important;
  user-select: none !important;
  -webkit-user-drag: none !important;
  pointer-events: none !important;
}

/* 老角色与既有角色大图 */
div.custom-nvn-dialogue:is([data-char*="克蕾雅"], [data-char*="卢克蕾齐雅"]) .custom-nvn-portrait-full { content: url("https://origin.picgo.net/2026/09/17/ac92bf314de5fc2fb6488b395a70a66e25515781bb8ce916.png") !important; }
div.custom-nvn-dialogue:is([data-char*="莉莉娅"], [data-char*="莉莉娅"]) .custom-nvn-portrait-full { content: url("https://origin.picgo.net/2026/09/17/bd044dfa7368a3ba194fb70aba371bb3b6c8d9d8549fdba4.png") !important; }
div.custom-nvn-dialogue:is([data-char*="拉姆内"], [data-char*="拉姆"]) .custom-nvn-portrait-full { content: url("https://origin.picgo.net/2026/09/17/dc9fbb30e0fcad68889c2cfec6b44be64df519f948e21102.png") !important; }
div.custom-nvn-dialogue:is([data-char*="梅拉妮"], [data-char*="梅拉"]) .custom-nvn-portrait-full { content: url("https://origin.picgo.net/2026/09/17/e96503f65df8e12335d3feaea70d815cffe85f3f45f159d0.png") !important; }
div.custom-nvn-dialogue[data-char*="艾拉"] .custom-nvn-portrait-full { content: url("https://origin.picgo.net/2026/09/17/d499b077a20483ccec94a8f8767d7ed9fbcb078642081343.png") !important; }
div.custom-nvn-dialogue[data-char*="阿黛拉"] .custom-nvn-portrait-full { content: url("https://origin.picgo.net/2026/09/17/f805921447107f7a18959bcb44e0450aaa9ab7a77f7f4089.png") !important; }
div.custom-nvn-dialogue[data-char*="伊莉丝"] .custom-nvn-portrait-full { content: url("https://origin.picgo.net/2026/09/19/d1e3701a4b70c450df76c7be4db7a226dff0f9fc5cf83559.png") !important; }
div.custom-nvn-dialogue[data-char*="丽塔"] .custom-nvn-portrait-full { content: url("https://origin.picgo.net/2026/09/19/925f8d71cb2fac2c2a8a3bb41ef16a20c88912bec412ddb7.png") !important; }
div.custom-nvn-dialogue:is([data-char*="菲娅娜"], [data-char*="菲娅"]) .custom-nvn-portrait-full { content: url("https://origin.picgo.net/2026/09/19/dd1a26263d3cbda4f6835d6e438a71bd37e1d1583271651e.png") !important; }
div.custom-nvn-dialogue[data-char*="露娜"] .custom-nvn-portrait-full { content: url("https://origin.picgo.net/2026/09/19/e4f006d8683d57ebe4b1015c456fb2902365d39fba89f736.png") !important; }
div.custom-nvn-dialogue[data-char*="夏洛特"]:not([data-char*="驱魔"]) .custom-nvn-portrait-full { content: url("https://origin.picgo.net/2026/09/25/afbc6af184ba84ce4ff48bf5ff959fd7613cfd269a0d8c57.png") !important; }
div.custom-nvn-dialogue[data-char*="驱魔夏洛特"] .custom-nvn-portrait-full { content: url("https://origin.picgo.net/2026/09/25/80c5b83ebc4cf409736f3a53016fb8535416b93c0dbf8cac.png") !important; }
div.custom-nvn-dialogue[data-char*="响木天音"] .custom-nvn-portrait-full { content: url("https://origin.picgo.net/2026/09/25/1b0ff70cf6e19f8fa.png") !important; }
div.custom-nvn-dialogue[data-char*="法妮雅"] .custom-nvn-portrait-full { content: url("https://origin.picgo.net/2026/09/25/29f7fcf40b75dde73.png") !important; }
div.custom-nvn-dialogue[data-char*="芙洛蒂"] .custom-nvn-portrait-full { content: url("https://origin.picgo.net/2026/09/25/285955c693bed23c1efd2029b2646423c85fde1138b1617c.png") !important; }
div.custom-nvn-dialogue[data-char*="艾妮希雅"] .custom-nvn-portrait-full { content: url("https://origin.picgo.net/2026/09/25/835a9f2773f0b2b456c0619dbceb2973722d9027b959759a.png") !important; }
div.custom-nvn-dialogue[data-char*="凯拉涅斯"] .custom-nvn-portrait-full { content: url("https://origin.picgo.net/2026/09/25/ed7b112820120595911db8cb66c0af147c44e36ab92dea68.png") !important; }
div.custom-nvn-dialogue[data-char*="赛蕾姆丝"] .custom-nvn-portrait-full { content: url("https://origin.picgo.net/2026/09/25/dc000d04db92fd46d5e1c6fc25b64d727f059ecb23ff1026.png") !important; }
div.custom-nvn-dialogue[data-char*="小忆"] .custom-nvn-portrait-full { content: url("https://origin.picgo.net/2026/09/26/3eca99d0baa472ed543512d23a401e86a6b4c4694736f9cc.png") !important; }
div.custom-nvn-dialogue[data-char*="斯雅"] .custom-nvn-portrait-full { content: url("https://origin.picgo.net/2026/09/26/21646d2441741d1fa.png") !important; }
div.custom-nvn-dialogue[data-char*="蒂莎"] .custom-nvn-portrait-full { content: url("https://origin.picgo.net/2026/09/28/2c6c6c7cf27c5d81571225e875c16eaf61571150c7084731.png") !important; }
div.custom-nvn-dialogue[data-char*="奇诺米"] .custom-nvn-portrait-full { content: url("https://origin.picgo.net/2026/09/28/26681cd9be7ff8260.png") !important; }
div.custom-nvn-dialogue[data-char*="帕特里琪娅"] .custom-nvn-portrait-full { content: url("https://origin.picgo.net/2026/09/28/25a75db1a013fb416d6ab770e08b6c724ea8266c5e5912d4.png") !important; }
div.custom-nvn-dialogue[data-char*="加莉泰娅"] .custom-nvn-portrait-full { content: url("https://origin.picgo.net/2026/09/28/43cdc177a9387cfbf1cac5bea0aa794ac066ff817585f1e8.png") !important; }
div.custom-nvn-dialogue:is([data-char*="盖欧露易丝"], [data-char*="露易丝"]):not([data-char*="王铠"]) .custom-nvn-portrait-full { content: url("https://origin.picgo.net/2026/09/28/60a7b3c7528787365a0b9641693355be4d6a8795fc0d4d41.png") !important; }
div.custom-nvn-dialogue[data-char*="王铠盖欧露易丝"] .custom-nvn-portrait-full { content: url("https://origin.picgo.net/2026/09/28/2f16d8141084e5ead3b6ee85db478024de7e86fc1853bc89.png") !important; }
div.custom-nvn-dialogue[data-char*="古伊奈"]:not([data-char*="王铠"]) .custom-nvn-portrait-full { content: url("https://origin.picgo.net/2026/09/28/b91c910c9dae7659cce6f8d53fabc402a93a48de03844a13.png") !important; }
div.custom-nvn-dialogue[data-char*="王铠古伊奈"] .custom-nvn-portrait-full { content: url("https://origin.picgo.net/2026/09/28/b76f9d6363c6d7cd296c4ec190f40446b3051434372995ff.png") !important; }
div.custom-nvn-dialogue:is([data-char*="斯提亚拉"], [data-char*="提亚拉"]) .custom-nvn-portrait-full { content: url("https://origin.picgo.net/2026/09/28/9d22eb544a59537f2b86e4fa07c4aa1bd16ed95d73ebe063.png") !important; }
div.custom-nvn-dialogue[data-char*="雷克西斯"] .custom-nvn-portrait-full { content: url("https://origin.picgo.net/2026/09/28/94b515d79b47bbd27a34a4b7182512d13936a17a75a1011d.png") !important; }

/* 🌟 本次新角色大图映射 */
div.custom-nvn-dialogue[data-char*="艾尔希"]:not([data-char*="IV"]) .custom-nvn-portrait-full { content: url("https://origin.picgo.net/2026/09/29/da4a4c8d7ddc8a4e10.png") !important; }
div.custom-nvn-dialogue[data-char*="艾尔希IV"] .custom-nvn-portrait-full { content: url("https://origin.picgo.net/2026/09/29/260df9199dd6fb1f0f552e3ffc12105e6d3cace97d3cbdad.png") !important; }
div.custom-nvn-dialogue[data-char*="狄娜"] .custom-nvn-portrait-full { content: url("https://origin.picgo.net/2026/09/29/f762e8ea187a59bd7ff44d653e0cbc73785e9571140b2d72.png") !important; }
div.custom-nvn-dialogue[data-char*="卡莲"] .custom-nvn-portrait-full { content: url("https://origin.picgo.net/2026/09/29/b9b78116e0bfe70bc46b0b4580dbbf038102a23c4e338cc4.png") !important; }
div.custom-nvn-dialogue[data-char*="柯萝特"] .custom-nvn-portrait-full { content: url("https://origin.picgo.net/2026/09/29/b23e3b7d67983d6f31df4d11182ac4a9005289b086f6817f.png") !important; }
div.custom-nvn-dialogue[data-char*="幽妮娅"] .custom-nvn-portrait-full { content: url("https://origin.picgo.net/2026/09/29/lihuifa9005a93c640406.png") !important; }
div.custom-nvn-dialogue[data-char*="托莉娜"]:not([data-char*="魔化"]) .custom-nvn-portrait-full { content: url("https://origin.picgo.net/2026/10/02/61144e7687c3e0fe0ba1946940e64c09032c738028a3f759.png") !important; }
div.custom-nvn-dialogue[data-char*="魔化托莉娜"] .custom-nvn-portrait-full { content: url("https://origin.picgo.net/2026/10/02/f5721a8e9a671b9510b105a3a44059304a6fbb0293e60df2.png") !important; }
div.custom-nvn-dialogue:is([data-char*="一之濑雫"], ) .custom-nvn-portrait-full { content: url("https://origin.picgo.net/2026/10/02/d87fc72aee3455f8114a1ce7ef099ed0df6e35429ab21f77.png") !important; }
/* ====== 移动端自适应 ====== */
@media (max-width: 560px) {
  .custom-nvn-dialogue { gap: 12px; margin: 10px 0 12px; }
  .custom-nvn-avatar-side, .custom-nvn-avatar-img { width: 75px; height: 95px !important; min-height: 95px !important; flex-basis: 75px; border-radius: 12px; }
  .custom-nvn-name-plate { min-height: 32px; padding: 2px 18px 2px 8px; }
  .custom-nvn-rose-crest { width: 18px; height: 18px; }
  .custom-nvn-name-initial { font-size: 1.3em; }
  .custom-nvn-text { padding: 2px 0 2px 12px !important; }
  .custom-nvn-text::before { top: 8px; width: 5px; height: 5px; left: -3.5px; }
  .custom-nvn-motion { padding-left: 12px; font-size: 0.86em; }
  .custom-nvn-avatar-fallback { max-width: 2.2em; font-size: 1.1em; }

  [is_user="true"] .custom-nvn-dialogue .custom-nvn-name-plate,
  .custom-nvn-dialogue:is([data-player^="user"], [data-player="true"]) .custom-nvn-name-plate {
    padding: 2px 8px 2px 18px !important;
  }
  [is_user="true"] .custom-nvn-dialogue .custom-nvn-text,
  .custom-nvn-dialogue:is([data-player^="user"], [data-player="true"]) .custom-nvn-text {
    padding-left: 0 !important;
    padding-right: 12px !important;
  }
  [is_user="true"] .custom-nvn-dialogue .custom-nvn-text::before,
  .custom-nvn-dialogue:is([data-player^="user"], [data-player="true"]) .custom-nvn-text::before {
    right: -3.5px !important;
  }
  [is_user="true"] .custom-nvn-dialogue .custom-nvn-motion,
  .custom-nvn-dialogue:is([data-player^="user"], [data-player="true"]) .custom-nvn-motion {
    padding-right: 12px !important;
  }
}

/* 消除 Markdown 斜体污染 */
.custom-nvn-dialogue em, .custom-nvn-dialogue i,
.custom-nvn-primary em, .custom-nvn-primary i,
.custom-nvn-motion em, .custom-nvn-motion i,
.custom-nvn-text em, .custom-nvn-text i,
.custom-nvn-name-box em, .custom-nvn-name-box i {
  font-style: normal !important;
  font-weight: inherit !important;
  font-size: inherit !important;
  color: inherit !important;
  background: none !important;
  border: none !important;
  letter-spacing: inherit !important;
  text-shadow: inherit !important;
  line-height: inherit !important;
}

/* ⭐ 隐藏空的尾部对话容器 */
.custom-nvn-text-tail:has(.custom-nvn-primary:empty) {
  display: none !important;
}

/* ====== 修复第二段对白变色与双重括号问题 ====== */
.custom-nvn-text-tail .custom-nvn-quote-mark {
  display: inline !important;
}

.custom-nvn-text-tail .custom-nvn-primary,
.custom-nvn-text-tail .custom-nvn-primary * {
  color: var(--stage-text) !important;
  background: transparent !important;
  border: none !important;
  font-family: inherit !important;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.8) !important;
}
.custom-nvn-text-tail .custom-nvn-primary * {
  font-size: inherit !important;
}

/* =========================================================================
 * 🎯 BS2 角色专属，因为原图存在空白留底，因此这里需要保持标准框体大小，仅背景图微调贴底
 * ========================================================================= */
div.custom-nvn-dialogue:is(
  [data-char*="爱丽丝"], [data-char*="诺登"], [data-char*="小红帽"], [data-char*="普利凯特"],
  [data-char*="梅贝尔"], [data-char*="玛丽·安"], [data-char*="莉耶芙"], [data-char*="公爵夫人"],
  [data-char*="帽子屋"], [data-char*="三月兔"], [data-char*="格里菲"], [data-char*="假海龟"],
  [data-char*="渡渡"], [data-char*="希夏"], [data-char*="比尔"], [data-char*="维多利雅"],
  [data-char*="弗洛伦斯"], [data-char*="罗丽娜"], [data-char*="格尔达"], [data-char*="尤妮丝"],
  [data-char*="莱登"], [data-char*="克缇"], [data-char*="贾巴沃克"], [data-char*="贾布加布"],
  [data-char*="班达斯奈奇"], [data-char*="希伏契"], [data-char*="柴郡猫"], [data-char*="人偶爱丽丝"],
  [data-char*="崔德尔"], [data-char*="雏鸟"], [data-char*="蛇神"]
) .custom-nvn-avatar-img {
  background-size: cover !important;   
  background-position: center 3px !important;       
  transform: none !important;                        
}


/* ==================== 摇篮（Alice in Cradle） ==================== */
/* 诺艾儿 */
div.custom-nvn-dialogue:is([data-char*="诺艾儿"], [data-char*="诺艾尔"], [data-char*="诺艾儿·柯涅尔"], [data-char*="诺艾尔·柯涅尔"]) { --main: #e6d5a8 !important; --sub: #fbf7ea !important; --rgb: 230, 213, 168 !important; --motion-color: #f0e2be !important; }
div.custom-nvn-dialogue:is([data-char*="诺艾儿"], [data-char*="诺艾尔"], [data-char*="诺艾儿·柯涅尔"], [data-char*="诺艾尔·柯涅尔"]) .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/09/dbf1773e4b140fb5d2b9b87f563b578f0d2610f2c16fcd74.png") !important; }
div.custom-nvn-dialogue:is([data-char*="诺艾儿"], [data-char*="诺艾尔"], [data-char*="诺艾儿·柯涅尔"], [data-char*="诺艾尔·柯涅尔"])[data-action*="脸红"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/09/2e21f87da09ae43c0cbb1cea0093c87fe4b3f0dc7d38b17b.png") !important; }
div.custom-nvn-dialogue:is([data-char*="诺艾儿"], [data-char*="诺艾尔"], [data-char*="诺艾儿·柯涅尔"], [data-char*="诺艾尔·柯涅尔"])[data-action="通常"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/09/dbf1773e4b140fb5d2b9b87f563b578f0d2610f2c16fcd74.png") !important; }
div.custom-nvn-dialogue:is([data-char*="诺艾儿"], [data-char*="诺艾尔"], [data-char*="诺艾儿·柯涅尔"], [data-char*="诺艾尔·柯涅尔"])[data-action="脸红通常"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/09/2e21f87da09ae43c0cbb1cea0093c87fe4b3f0dc7d38b17b.png") !important; }
div.custom-nvn-dialogue:is([data-char*="诺艾儿"], [data-char*="诺艾尔"], [data-char*="诺艾儿·柯涅尔"], [data-char*="诺艾尔·柯涅尔"])[data-action="得意"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/09/f4dd1c2b085b65f1f26050cb8b8de846c74625348a25bbb2.png") !important; }
div.custom-nvn-dialogue:is([data-char*="诺艾儿"], [data-char*="诺艾尔"], [data-char*="诺艾儿·柯涅尔"], [data-char*="诺艾尔·柯涅尔"])[data-action="脸红得意"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/09/cdfd732f11e1b155951a1c13202abed1485d2b64cef1a223.png") !important; }
div.custom-nvn-dialogue:is([data-char*="诺艾儿"], [data-char*="诺艾尔"], [data-char*="诺艾儿·柯涅尔"], [data-char*="诺艾尔·柯涅尔"])[data-action="腹黑笑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/09/348de2c1f5eb85cb73e77aedf144caa6110a87327a36ff99.png") !important; }
div.custom-nvn-dialogue:is([data-char*="诺艾儿"], [data-char*="诺艾尔"], [data-char*="诺艾儿·柯涅尔"], [data-char*="诺艾尔·柯涅尔"])[data-action="脸红腹黑笑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/09/7633dfeacbef67ba549f71ad09965b7e538808b886f4f4c6.png") !important; }
div.custom-nvn-dialogue:is([data-char*="诺艾儿"], [data-char*="诺艾尔"], [data-char*="诺艾儿·柯涅尔"], [data-char*="诺艾尔·柯涅尔"])[data-action="害羞"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/09/eb9421caad13182c5b2c7949b7e046d8391b6a8d136d2cda.png") !important; }
div.custom-nvn-dialogue:is([data-char*="诺艾儿"], [data-char*="诺艾尔"], [data-char*="诺艾儿·柯涅尔"], [data-char*="诺艾尔·柯涅尔"])[data-action="惊讶"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/09/49120746356a2d7eda0f3ad651af123e09893a22bcaf0d5d.png") !important; }
div.custom-nvn-dialogue:is([data-char*="诺艾儿"], [data-char*="诺艾尔"], [data-char*="诺艾儿·柯涅尔"], [data-char*="诺艾尔·柯涅尔"])[data-action="脸红惊讶"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/09/535755d6d24f190998eefec264b09e95a0d105fed994e5f4.png") !important; }
div.custom-nvn-dialogue:is([data-char*="诺艾儿"], [data-char*="诺艾尔"], [data-char*="诺艾儿·柯涅尔"], [data-char*="诺艾尔·柯涅尔"])[data-action="高兴"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/09/0d238c8f045c4941da047614e09ec6a49a4f109eaca6b46c.png") !important; }
div.custom-nvn-dialogue:is([data-char*="诺艾儿"], [data-char*="诺艾尔"], [data-char*="诺艾儿·柯涅尔"], [data-char*="诺艾尔·柯涅尔"])[data-action="脸红高兴"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/09/022f2ca9521a15e50f0414db38efc3d43e74df7977ee19b5.png") !important; }
div.custom-nvn-dialogue:is([data-char*="诺艾儿"], [data-char*="诺艾尔"], [data-char*="诺艾儿·柯涅尔"], [data-char*="诺艾尔·柯涅尔"])[data-action="难过"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/09/945fcff7deb2dc935fa8a3a7749b549998b7d56f17e0685a.png") !important; }
div.custom-nvn-dialogue:is([data-char*="诺艾儿"], [data-char*="诺艾尔"], [data-char*="诺艾儿·柯涅尔"], [data-char*="诺艾尔·柯涅尔"])[data-action="脸红难过"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/09/0bf2cd7750bead49d0480c4960dd018f824818d9de02be69.png") !important; }
div.custom-nvn-dialogue:is([data-char*="诺艾儿"], [data-char*="诺艾尔"], [data-char*="诺艾儿·柯涅尔"], [data-char*="诺艾尔·柯涅尔"])[data-action="疑惑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/09/f732f4719c8eb03c78e18415764bc9b6ba97de2f2e131f83.png") !important; }
div.custom-nvn-dialogue:is([data-char*="诺艾儿"], [data-char*="诺艾尔"], [data-char*="诺艾儿·柯涅尔"], [data-char*="诺艾尔·柯涅尔"])[data-action="脸红疑惑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/09/7648e3d482c734fc18ab8927caed736168cb13f1402a6d7d.png") !important; }
div.custom-nvn-dialogue:is([data-char*="诺艾儿"], [data-char*="诺艾尔"], [data-char*="诺艾儿·柯涅尔"], [data-char*="诺艾尔·柯涅尔"])[data-action="生气"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/09/81b2795e32c858283ad83d941dd8465af367762d67f71b0f.png") !important; }
div.custom-nvn-dialogue:is([data-char*="诺艾儿"], [data-char*="诺艾尔"], [data-char*="诺艾儿·柯涅尔"], [data-char*="诺艾尔·柯涅尔"])[data-action="脸红生气"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/09/614649e0edee1d349725d6fc9d7fefc69315448936ece6ad.png") !important; }
div.custom-nvn-dialogue:is([data-char*="诺艾儿"], [data-char*="诺艾尔"], [data-char*="诺艾儿·柯涅尔"], [data-char*="诺艾尔·柯涅尔"])[data-action="皱眉"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/09/a154d861bca7a87f53453c13c9943095363db956a70586d9.png") !important; }
div.custom-nvn-dialogue:is([data-char*="诺艾儿"], [data-char*="诺艾尔"], [data-char*="诺艾儿·柯涅尔"], [data-char*="诺艾尔·柯涅尔"])[data-action="脸红皱眉"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/09/8b9a6b341cff9582779d249eb943474f62d54bddc38b3a0a.png") !important; }
div.custom-nvn-dialogue:is([data-char*="诺艾儿"], [data-char*="诺艾尔"], [data-char*="诺艾儿·柯涅尔"], [data-char*="诺艾尔·柯涅尔"])[data-action="思考"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/09/86e1b1277e616f4555a496475822a01fb620dd006d1d8c2a.png") !important; }
div.custom-nvn-dialogue:is([data-char*="诺艾儿"], [data-char*="诺艾尔"], [data-char*="诺艾儿·柯涅尔"], [data-char*="诺艾尔·柯涅尔"])[data-action="脸红思考"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/09/a603afab8981e1ab77cd48b9152b5985eed0d204292aa09d.png") !important; }
div.custom-nvn-dialogue:is([data-char*="诺艾儿"], [data-char*="诺艾尔"], [data-char*="诺艾儿·柯涅尔"], [data-char*="诺艾尔·柯涅尔"]) .custom-nvn-portrait-full { content: url("https://origin.picgo.net/2026/10/09/2a22d924594f08f05215076841ae8b9f44eb2f199514ad4b.png") !important; }

/* 诺艾尔·私 */
div.custom-nvn-dialogue:is([data-char*="诺艾尔·私"], [data-char*="诺艾儿·私"]) { --main: #e6d5a8 !important; --sub: #fbf7ea !important; --rgb: 230, 213, 168 !important; --motion-color: #f0e2be !important; }
div.custom-nvn-dialogue:is([data-char*="诺艾尔·私"], [data-char*="诺艾儿·私"]) .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/09/1c44cfef5136c78c62c1c410c12e440bfb41f653c8d369ed.png") !important; }
div.custom-nvn-dialogue:is([data-char*="诺艾尔·私"], [data-char*="诺艾儿·私"])[data-action*="脸红"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/09/e72b3031828d9b6035b15f59e49caf6e1a157adeed979d84.png") !important; }
div.custom-nvn-dialogue:is([data-char*="诺艾尔·私"], [data-char*="诺艾儿·私"])[data-action="通常"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/09/1c44cfef5136c78c62c1c410c12e440bfb41f653c8d369ed.png") !important; }
div.custom-nvn-dialogue:is([data-char*="诺艾尔·私"], [data-char*="诺艾儿·私"])[data-action="脸红通常"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/09/e72b3031828d9b6035b15f59e49caf6e1a157adeed979d84.png") !important; }
div.custom-nvn-dialogue:is([data-char*="诺艾尔·私"], [data-char*="诺艾儿·私"])[data-action="得意"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/09/ba66699aebbd252824cd88dcdcbf3f2dfa04ccf3f376e7e2.png") !important; }
div.custom-nvn-dialogue:is([data-char*="诺艾尔·私"], [data-char*="诺艾儿·私"])[data-action="脸红得意"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/09/5cfd4a82dc71cfa408092d2cf235bfe06786b10c6c26e9d6.png") !important; }
div.custom-nvn-dialogue:is([data-char*="诺艾尔·私"], [data-char*="诺艾儿·私"])[data-action="腹黑笑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/09/a2b9424b8df7431d201750b8b0fd4fbc5ee9dbc00f0dbd35.png") !important; }
div.custom-nvn-dialogue:is([data-char*="诺艾尔·私"], [data-char*="诺艾儿·私"])[data-action="脸红腹黑笑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/09/15b2202f0d959358499497d63a5e44947e572ef80252b601.png") !important; }
div.custom-nvn-dialogue:is([data-char*="诺艾尔·私"], [data-char*="诺艾儿·私"])[data-action="害羞"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/09/891266c055a5b6a1fd945a161e89e8858b524ad945d1513b.png") !important; }
div.custom-nvn-dialogue:is([data-char*="诺艾尔·私"], [data-char*="诺艾儿·私"])[data-action="惊讶"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/09/9674544bbcbccd20fdd7a33a0e14d1a2e96f67b87144f0bf.png") !important; }
div.custom-nvn-dialogue:is([data-char*="诺艾尔·私"], [data-char*="诺艾儿·私"])[data-action="脸红惊讶"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/09/b5fc34e317db98e9fa5d7f759ab911aaa85cd330d8a8f1ad.png") !important; }
div.custom-nvn-dialogue:is([data-char*="诺艾尔·私"], [data-char*="诺艾儿·私"])[data-action="高兴"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/09/1c44cfef5136c78c62c1c410c12e440bfb41f653c8d369ed.png") !important; }
div.custom-nvn-dialogue:is([data-char*="诺艾尔·私"], [data-char*="诺艾儿·私"])[data-action="脸红高兴"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/09/e72b3031828d9b6035b15f59e49caf6e1a157adeed979d84.png") !important; }
div.custom-nvn-dialogue:is([data-char*="诺艾尔·私"], [data-char*="诺艾儿·私"])[data-action="难过"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/09/eacb914c7244a08bb063b5b0b0b63f4f8e089243bb9e9174.png") !important; }
div.custom-nvn-dialogue:is([data-char*="诺艾尔·私"], [data-char*="诺艾儿·私"])[data-action="脸红难过"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/09/dd5380cf576e93bd883a8e719b3416a592a73e9447b9ff1a.png") !important; }
div.custom-nvn-dialogue:is([data-char*="诺艾尔·私"], [data-char*="诺艾儿·私"])[data-action="疑惑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/09/30f4f204590c64b512a973b9a1ed167157057c30bc7640b2.png") !important; }
div.custom-nvn-dialogue:is([data-char*="诺艾尔·私"], [data-char*="诺艾儿·私"])[data-action="脸红疑惑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/09/eda5a586797030c4789da819721ed6b37b9fb5944ae10ac5.png") !important; }
div.custom-nvn-dialogue:is([data-char*="诺艾尔·私"], [data-char*="诺艾儿·私"])[data-action="生气"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/09/91b3bd8fe07b450a051021a6d177aad762dbe43693e8fc4b.png") !important; }
div.custom-nvn-dialogue:is([data-char*="诺艾尔·私"], [data-char*="诺艾儿·私"])[data-action="脸红生气"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/09/61f6460dae961750dcb0038dc64a4dad838b0c3c78345011.png") !important; }
div.custom-nvn-dialogue:is([data-char*="诺艾尔·私"], [data-char*="诺艾儿·私"])[data-action="皱眉"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/09/d60e247fdf51ceaf6f2a1f6f7437f3d1b29f4f3778fd3948.png") !important; }
div.custom-nvn-dialogue:is([data-char*="诺艾尔·私"], [data-char*="诺艾儿·私"])[data-action="脸红皱眉"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/09/312f4eb93abed942a0ee9c4f912f53fb61267a05b80173ad.png") !important; }
div.custom-nvn-dialogue:is([data-char*="诺艾尔·私"], [data-char*="诺艾儿·私"])[data-action="思考"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/09/909b5947f95c6001c1ed5926de5069678bfc88ed97096912.png") !important; }
div.custom-nvn-dialogue:is([data-char*="诺艾尔·私"], [data-char*="诺艾儿·私"])[data-action="脸红思考"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/09/4fd41183ff2a376e4411a9da1674999e84a4ff4ebae7f4bf.png") !important; }
div.custom-nvn-dialogue:is([data-char*="诺艾尔·私"], [data-char*="诺艾儿·私"]) .custom-nvn-portrait-full { content: url("https://origin.picgo.net/2026/10/09/7227ffec17576c98216dd48037335cec70414d3e4f654b6f.png") !important; }

/* 爱莉丝 */
div.custom-nvn-dialogue:is([data-char*="爱莉丝"], [data-char*="摇篮的爱莉丝"]) { --main: #f0a3c0 !important; --sub: #fdeef5 !important; --rgb: 240, 163, 192 !important; --motion-color: #f7bcd2 !important; }
div.custom-nvn-dialogue:is([data-char*="爱莉丝"], [data-char*="摇篮的爱莉丝"]) .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/09/e7358a0e690ac9ee8d3aa49c800ee009bfb40ef3e2806f70.png") !important; }
div.custom-nvn-dialogue:is([data-char*="爱莉丝"], [data-char*="摇篮的爱莉丝"])[data-action*="脸红"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/09/ce733e88732ac801bb359d3e04ea67669ade161be2241b71.png") !important; }
div.custom-nvn-dialogue:is([data-char*="爱莉丝"], [data-char*="摇篮的爱莉丝"])[data-action="通常"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/09/e7358a0e690ac9ee8d3aa49c800ee009bfb40ef3e2806f70.png") !important; }
div.custom-nvn-dialogue:is([data-char*="爱莉丝"], [data-char*="摇篮的爱莉丝"])[data-action="脸红通常"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/09/ce733e88732ac801bb359d3e04ea67669ade161be2241b71.png") !important; }
div.custom-nvn-dialogue:is([data-char*="爱莉丝"], [data-char*="摇篮的爱莉丝"])[data-action="得意"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/09/95bc1cdbfa9668db2fbc8dc06298a33bcb785f4a017d8b06.png") !important; }
div.custom-nvn-dialogue:is([data-char*="爱莉丝"], [data-char*="摇篮的爱莉丝"])[data-action="脸红得意"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/09/6cc74a3827b2868251f471906893d0447b10980b035a1ff1.png") !important; }
div.custom-nvn-dialogue:is([data-char*="爱莉丝"], [data-char*="摇篮的爱莉丝"])[data-action="腹黑笑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/09/474a66c78a185da649816aa195d2721975e278cbaa478157.png") !important; }
div.custom-nvn-dialogue:is([data-char*="爱莉丝"], [data-char*="摇篮的爱莉丝"])[data-action="脸红腹黑笑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/09/e662725f3b4761ca21fef1ca09745e43728488d4cd99b287.png") !important; }
div.custom-nvn-dialogue:is([data-char*="爱莉丝"], [data-char*="摇篮的爱莉丝"])[data-action="害羞"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/09/219ede39b673002d5e0cc81e0dcf911f1383408311f9281c.png") !important; }
div.custom-nvn-dialogue:is([data-char*="爱莉丝"], [data-char*="摇篮的爱莉丝"])[data-action="惊讶"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/09/61e8cfe22667c2a134f1f154b0abc08c89ef5ff2ecf4e089.png") !important; }
div.custom-nvn-dialogue:is([data-char*="爱莉丝"], [data-char*="摇篮的爱莉丝"])[data-action="脸红惊讶"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/09/b421f39fb65f386a7e4e4a04d0ef5014ca95dfc72700d142.png") !important; }
div.custom-nvn-dialogue:is([data-char*="爱莉丝"], [data-char*="摇篮的爱莉丝"])[data-action="高兴"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/09/30cd68f371ae7e82d1f023ff77bbd5fcf669e82f16a6db0f.png") !important; }
div.custom-nvn-dialogue:is([data-char*="爱莉丝"], [data-char*="摇篮的爱莉丝"])[data-action="脸红高兴"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/09/219ede39b673002d5e0cc81e0dcf911f1383408311f9281c.png") !important; }
div.custom-nvn-dialogue:is([data-char*="爱莉丝"], [data-char*="摇篮的爱莉丝"])[data-action="难过"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/09/92aaf3b3476639523d8d7c59b512ed8d70aa835f79fd8999.png") !important; }
div.custom-nvn-dialogue:is([data-char*="爱莉丝"], [data-char*="摇篮的爱莉丝"])[data-action="脸红难过"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/09/eb4937ed6a352d2d3db35806a734fc147578f4e70988a7d2.png") !important; }
div.custom-nvn-dialogue:is([data-char*="爱莉丝"], [data-char*="摇篮的爱莉丝"])[data-action="疑惑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/09/901d6472c99ff552c02cb737dd8663126fd8b89ef20e079a.png") !important; }
div.custom-nvn-dialogue:is([data-char*="爱莉丝"], [data-char*="摇篮的爱莉丝"])[data-action="脸红疑惑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/09/437476fa2160b6f578c88b04fe56843ed4a85c8df7ccb5a1.png") !important; }
div.custom-nvn-dialogue:is([data-char*="爱莉丝"], [data-char*="摇篮的爱莉丝"])[data-action="生气"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/09/0cc63fed6f082fdbed7d87f697cd6e29085c28cea551c835.png") !important; }
div.custom-nvn-dialogue:is([data-char*="爱莉丝"], [data-char*="摇篮的爱莉丝"])[data-action="脸红生气"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/09/71de764c60a2f57030b1f78578b6bfea6f0f3df4c149e780.png") !important; }
div.custom-nvn-dialogue:is([data-char*="爱莉丝"], [data-char*="摇篮的爱莉丝"])[data-action="皱眉"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/09/0b48d9f3e564e241213b80f4f2909e365c6a63e0c1f0a66c.png") !important; }
div.custom-nvn-dialogue:is([data-char*="爱莉丝"], [data-char*="摇篮的爱莉丝"])[data-action="脸红皱眉"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/09/b2bdd9bf9ce566415d7f81322e766747e4a23167fc985bcb.png") !important; }
div.custom-nvn-dialogue:is([data-char*="爱莉丝"], [data-char*="摇篮的爱莉丝"])[data-action="思考"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/09/f50eb2de8df39d4ade8a4ffad1176f72c83025e0d5fc6ecc.png") !important; }
div.custom-nvn-dialogue:is([data-char*="爱莉丝"], [data-char*="摇篮的爱莉丝"])[data-action="脸红思考"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/09/4f7cb26816c02256e102f107ab97c81dc64adbfec56456a1.png") !important; }
div.custom-nvn-dialogue:is([data-char*="爱莉丝"], [data-char*="摇篮的爱莉丝"]) .custom-nvn-portrait-full { content: url("https://origin.picgo.net/2026/10/09/4f51b65c3e1ac30bd35c65c5556a3c12460f6d9382a5558c.png") !important; }

/* 丽薇歌塔 */
div.custom-nvn-dialogue:is([data-char*="丽薇歌塔"], [data-char*="丽薇歌塔·柯涅尔"]) { --main: #a3c8ea !important; --sub: #eef6fd !important; --rgb: 163, 200, 234 !important; --motion-color: #bcd8f2 !important; }
div.custom-nvn-dialogue:is([data-char*="丽薇歌塔"], [data-char*="丽薇歌塔·柯涅尔"]) .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/09/a8b107fdee3322ceaf8a60dd7a8e44f1a5400ba8a91b5357.png") !important; }
div.custom-nvn-dialogue:is([data-char*="丽薇歌塔"], [data-char*="丽薇歌塔·柯涅尔"])[data-action*="脸红"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/09/a8b107fdee3322ceaf8a60dd7a8e44f1a5400ba8a91b5357.png") !important; }
div.custom-nvn-dialogue:is([data-char*="丽薇歌塔"], [data-char*="丽薇歌塔·柯涅尔"])[data-action="脸红通常"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/09/a8b107fdee3322ceaf8a60dd7a8e44f1a5400ba8a91b5357.png") !important; }
div.custom-nvn-dialogue:is([data-char*="丽薇歌塔"], [data-char*="丽薇歌塔·柯涅尔"])[data-action="得意"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/09/c39089b1c7a9c730d052dd0a68a52cd493dcc42c301e733e.png") !important; }
div.custom-nvn-dialogue:is([data-char*="丽薇歌塔"], [data-char*="丽薇歌塔·柯涅尔"])[data-action="高兴"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/09/5c5fe0cf2d5881e458161c5f76d6fc3eeafc7e64af17240f.png") !important; }
div.custom-nvn-dialogue:is([data-char*="丽薇歌塔"], [data-char*="丽薇歌塔·柯涅尔"])[data-action="脸红高兴"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/09/1675a5403da89143dd693de27d6d510afb9c0a1bab0dfa5d.png") !important; }
div.custom-nvn-dialogue:is([data-char*="丽薇歌塔"], [data-char*="丽薇歌塔·柯涅尔"])[data-action="难过"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/09/07a75162b7b5495a03977f9271acc8185b215b9a0424188f.png") !important; }
div.custom-nvn-dialogue:is([data-char*="丽薇歌塔"], [data-char*="丽薇歌塔·柯涅尔"])[data-action="脸红难过"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/09/336dc29d4e818565fed9e783dab3292ffaa800abf3b4da6a.png") !important; }
div.custom-nvn-dialogue:is([data-char*="丽薇歌塔"], [data-char*="丽薇歌塔·柯涅尔"])[data-action="疑惑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/09/565951c73ea45efae68f01ede332cf22a3807f5f19f3cd12.png") !important; }
div.custom-nvn-dialogue:is([data-char*="丽薇歌塔"], [data-char*="丽薇歌塔·柯涅尔"])[data-action="脸红疑惑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/09/a286806d8297492edb5299bfa377b09aedbe8d5099adb126.png") !important; }
div.custom-nvn-dialogue:is([data-char*="丽薇歌塔"], [data-char*="丽薇歌塔·柯涅尔"])[data-action="生气"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/09/dd50cf2d80de88db794e1861182d6cb77198ddb661724a03.png") !important; }
div.custom-nvn-dialogue:is([data-char*="丽薇歌塔"], [data-char*="丽薇歌塔·柯涅尔"])[data-action="脸红生气"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/09/91e36c2efd26e388b71c4015caf7725255c06de0225ca4f5.png") !important; }
div.custom-nvn-dialogue:is([data-char*="丽薇歌塔"], [data-char*="丽薇歌塔·柯涅尔"])[data-action="思考"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/09/c2cb621bde4179bb71bc120233802f97948c1ee11d85b158.png") !important; }
div.custom-nvn-dialogue:is([data-char*="丽薇歌塔"], [data-char*="丽薇歌塔·柯涅尔"])[data-action="脸红思考"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/09/35268692abf3f6a61dea00d4473dae3717cd1d81c352e662.png") !important; }
div.custom-nvn-dialogue:is([data-char*="丽薇歌塔"], [data-char*="丽薇歌塔·柯涅尔"]) .custom-nvn-portrait-full { content: url("https://origin.picgo.net/2026/10/09/a8d19917fdf30ec250e7e8a11a42a48da380fe3803d7e02d.png") !important; }

/* 伊夏 */
div.custom-nvn-dialogue:is([data-char*="伊夏"], [data-char*="伊夏·波利斯塔切尔"]) { --main: #a3d9b0 !important; --sub: #eefaf1 !important; --rgb: 163, 217, 176 !important; --motion-color: #bce6c6 !important; }
div.custom-nvn-dialogue:is([data-char*="伊夏"], [data-char*="伊夏·波利斯塔切尔"]) .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/09/8a92daf62cb0dbefd47c13369d2a3723f1fa038f9a0f6fe0.png") !important; }
div.custom-nvn-dialogue:is([data-char*="伊夏"], [data-char*="伊夏·波利斯塔切尔"])[data-action*="脸红"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/09/561c1caf6da430312eabbe0d47262b93ae260508df542d62.png") !important; }
div.custom-nvn-dialogue:is([data-char*="伊夏"], [data-char*="伊夏·波利斯塔切尔"])[data-action="通常"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/09/8a92daf62cb0dbefd47c13369d2a3723f1fa038f9a0f6fe0.png") !important; }
div.custom-nvn-dialogue:is([data-char*="伊夏"], [data-char*="伊夏·波利斯塔切尔"])[data-action="脸红通常"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/09/561c1caf6da430312eabbe0d47262b93ae260508df542d62.png") !important; }
div.custom-nvn-dialogue:is([data-char*="伊夏"], [data-char*="伊夏·波利斯塔切尔"])[data-action="得意"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/09/717b67674f1b47449cf26f66063517f071af9533d49c5cee.png") !important; }
div.custom-nvn-dialogue:is([data-char*="伊夏"], [data-char*="伊夏·波利斯塔切尔"])[data-action="脸红得意"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/09/4022c9d438645db6d1a76523c126b50f8dbfd2fe74641f65.png") !important; }
div.custom-nvn-dialogue:is([data-char*="伊夏"], [data-char*="伊夏·波利斯塔切尔"])[data-action="腹黑笑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/09/1192afc57a98ef010c42b32fd5c1cc291c93314e6fe0e35b.png") !important; }
div.custom-nvn-dialogue:is([data-char*="伊夏"], [data-char*="伊夏·波利斯塔切尔"])[data-action="脸红腹黑笑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/09/6874e2746890bc5711de1fc434c5848effabd5dde880a1a7.png") !important; }
div.custom-nvn-dialogue:is([data-char*="伊夏"], [data-char*="伊夏·波利斯塔切尔"])[data-action="害羞"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/09/4e281341a5f0d8e3dbf67dff827e875988cce629bad291aa.png") !important; }
div.custom-nvn-dialogue:is([data-char*="伊夏"], [data-char*="伊夏·波利斯塔切尔"])[data-action="惊讶"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/09/52c5273ac136a3f7042846b1bade6e0940c9150d385cb294.png") !important; }
div.custom-nvn-dialogue:is([data-char*="伊夏"], [data-char*="伊夏·波利斯塔切尔"])[data-action="脸红惊讶"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/09/840a52689f59550208b7cc86e0a9832b328e624f7e0d5b9b.png") !important; }
div.custom-nvn-dialogue:is([data-char*="伊夏"], [data-char*="伊夏·波利斯塔切尔"])[data-action="高兴"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/09/f381ea13054cebdd6743acc0afd7e609f4676614746704c4.png") !important; }
div.custom-nvn-dialogue:is([data-char*="伊夏"], [data-char*="伊夏·波利斯塔切尔"])[data-action="脸红高兴"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/09/9a09778293405afef169392f11cd380366cd16cb4f4b330f.png") !important; }
div.custom-nvn-dialogue:is([data-char*="伊夏"], [data-char*="伊夏·波利斯塔切尔"])[data-action="难过"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/09/a24c2d5f9f935f56853def9455586f03ff0cb4286cbfbb0a.png") !important; }
div.custom-nvn-dialogue:is([data-char*="伊夏"], [data-char*="伊夏·波利斯塔切尔"])[data-action="脸红难过"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/09/8810f5154dd8b8f2496256f73c250fd724471c0a6a2fbcb9.png") !important; }
div.custom-nvn-dialogue:is([data-char*="伊夏"], [data-char*="伊夏·波利斯塔切尔"])[data-action="疑惑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/09/0ef748a58d80ef45d9b1d18ac071f3fd21b1cda8467bd1a1.png") !important; }
div.custom-nvn-dialogue:is([data-char*="伊夏"], [data-char*="伊夏·波利斯塔切尔"])[data-action="脸红疑惑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/09/064684554bcac177d700b63572cac522ff8f77dbf7baa29a.png") !important; }
div.custom-nvn-dialogue:is([data-char*="伊夏"], [data-char*="伊夏·波利斯塔切尔"])[data-action="生气"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/09/a8306a5be6d42d7a1a5bafaf5f436c0d6338a5d49df9ebde.png") !important; }
div.custom-nvn-dialogue:is([data-char*="伊夏"], [data-char*="伊夏·波利斯塔切尔"])[data-action="脸红生气"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/09/876283f3d02906e7e83e5ed01275ee44609dc3802d1cbdc9.png") !important; }
div.custom-nvn-dialogue:is([data-char*="伊夏"], [data-char*="伊夏·波利斯塔切尔"])[data-action="思考"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/09/51be9720b948143a31ff1a1db85c33befc834193d22ecfaa.png") !important; }
div.custom-nvn-dialogue:is([data-char*="伊夏"], [data-char*="伊夏·波利斯塔切尔"])[data-action="脸红思考"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/09/20fccf88515ce79b1c9d44373d165eb0d81b7794b9da6b08.png") !important; }
div.custom-nvn-dialogue:is([data-char*="伊夏"], [data-char*="伊夏·波利斯塔切尔"]) .custom-nvn-portrait-full { content: url("https://origin.picgo.net/2026/10/09/10b2aca97763eb3a49f8128a9814beb2c5481bd280ca3c43.png") !important; }

/* 普莉姆拉 */
div.custom-nvn-dialogue[data-char*="普莉姆拉"] { --main: #f0b48a !important; --sub: #fdf2ea !important; --rgb: 240, 180, 138 !important; --motion-color: #f5cbab !important; }
div.custom-nvn-dialogue[data-char*="普莉姆拉"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/09/f7f280b17e6d7805d7897ba696a1e20d3b8f10b29e9d8c94.png") !important; }
div.custom-nvn-dialogue[data-char*="普莉姆拉"] .custom-nvn-portrait-full { content: url("https://origin.picgo.net/2026/10/09/884cc922fd1904e67993d69e7d3445d5dffde6651ddc6375.png") !important; }

/* 蒂格蕾娜 */
div.custom-nvn-dialogue:is([data-char*="蒂格蕾娜"], [data-char*="蒂格蕾娜·索菈"]) { --main: #b8a3e0 !important; --sub: #f4f0fd !important; --rgb: 184, 163, 224 !important; --motion-color: #cdbdef !important; }
div.custom-nvn-dialogue:is([data-char*="蒂格蕾娜"], [data-char*="蒂格蕾娜·索菈"]) .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/09/2ec536e01e4a1d8fa5e03a3d0108a67f6fbb29064719cdbf.png") !important; }

/* 阿尔玛 */
div.custom-nvn-dialogue:is([data-char*="阿尔玛"], [data-char*="阿尔玛·奥普菲帕姆"]) { --main: #8fae8f !important; --sub: #f0f6f0 !important; --rgb: 143, 174, 143 !important; --motion-color: #a9c2a9 !important; }
div.custom-nvn-dialogue:is([data-char*="阿尔玛"], [data-char*="阿尔玛·奥普菲帕姆"]) .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/09/c198a204eee2c132480f921abc2d8ef9a3e0f3b392fc4390.png") !important; }
div.custom-nvn-dialogue:is([data-char*="阿尔玛"], [data-char*="阿尔玛·奥普菲帕姆"]) .custom-nvn-portrait-full { content: url("https://origin.picgo.net/2026/10/09/228295f011fe1684404359630b437c4b25a11bf8ad3f0d13.png") !important; }

/* 提尔德 */
div.custom-nvn-dialogue:is([data-char*="提尔德"], [data-char*="提尔德·柯涅尔"]) { --main: #a8d8d8 !important; --sub: #effafa !important; --rgb: 168, 216, 216 !important; --motion-color: #c0e6e6 !important; }
div.custom-nvn-dialogue:is([data-char*="提尔德"], [data-char*="提尔德·柯涅尔"]) .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/09/2b6b1e8136d25067d2ea66a8009867006d68b43a8642b5ba.png") !important; }

/* 德尔菲尼 */
div.custom-nvn-dialogue:is([data-char*="德尔菲尼"], [data-char*="德尔菲尼·柯涅尔"]) { --main: #9aae9a !important; --sub: #f1f6f1 !important; --rgb: 154, 174, 154 !important; --motion-color: #b0c2b0 !important; }
div.custom-nvn-dialogue:is([data-char*="德尔菲尼"], [data-char*="德尔菲尼·柯涅尔"]) .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/09/17eb70e5e194849d2a49305239c387dcac5ade9035262b14.png") !important; }

/* 梅法 */
div.custom-nvn-dialogue:is([data-char*="梅法"], [data-char*="梅法·格里亚德"]) { --main: #a3b8e0 !important; --sub: #eff3fc !important; --rgb: 163, 184, 224 !important; --motion-color: #bccbee !important; }
div.custom-nvn-dialogue:is([data-char*="梅法"], [data-char*="梅法·格里亚德"]) .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/09/5def7d08ef95a3b170e457c10a7089b027585b9f3ab31e06.png") !important; }

/* 南丁格尔 */
div.custom-nvn-dialogue[data-char*="南丁格尔"] { --main: #d99a8a !important; --sub: #fbf0ed !important; --rgb: 217, 154, 138 !important; --motion-color: #e6b1a3 !important; }
div.custom-nvn-dialogue[data-char*="南丁格尔"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/09/7ba8d84351398bde2d59f37b8576dfa103223c6e258a3bf5.png") !important; }

/* BS2 爱丽丝·利德尔 的短名绑定 */
div.custom-nvn-dialogue:is(:is([data-char*="爱丽丝"], [data-char*="爱·丽·丝"]), [data-char*="利德尔次女"]) { 
  --main: #f2d680 !important; 
  --sub: #fffdf5 !important; 
  --rgb: 242, 214, 128 !important; 
  --motion-color: #fae7a8 !important; 
}
div.custom-nvn-dialogue:is([data-char*="爱丽丝"], [data-char*="爱·丽·丝"]) .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/08/fb26cbb7d5caf2b3e5bb006a54de0875c04384eb7c62cad1.png") !important; }
div.custom-nvn-dialogue:is([data-char*="爱丽丝"], [data-char*="爱·丽·丝"]) .custom-nvn-portrait-full { content: url("https://origin.picgo.net/2026/10/08/fb26cbb7d5caf2b3e5bb006a54de0875c04384eb7c62cad1.png") !important; }

/* ==========================================================================
 * 中日双语模式补丁
 * 中文版与双语版的差异只在日文字体栈；这里按 data-mode 覆盖，
 * 所以同一份 CSS 同时支持两种模式。
 * ========================================================================== */
div.custom-nvn-dialogue[data-mode^="bilingual"],
div.custom-nvn-dialogue[data-mode^="bilingual"] .custom-nvn-text,
div.custom-nvn-dialogue[data-mode^="bilingual"] .custom-nvn-motion {
  font-family: "Noto Serif SC", "Source Han Serif SC", "Hiragino Mincho ProN", "Yu Mincho", serif !important;
}

/* ==== 双语专属：ruby 注音与译文标记 ==== */
[data-quote="〈"] .custom-nvn-bilingual-ruby{color: #e8dcff !important; text-shadow: 0 0 8px rgba(var(--rgb), .45), 0 1px 3px rgba(0,0,0,.85) !important;}
.custom-nvn-bilingual-ruby{font-size: 1.10em !important; line-height: 2.3 !important;}
.custom-nvn-bilingual-ruby rt{font-size: 0.75em !important; transform: translateY(-3px) !important;}
.custom-nvn-trans-rt:not(:empty)::before{content: "“"; font-family: "Noto Serif SC", "Source Han Serif SC", serif; font-size: 0.88em; color: var(--main); opacity: 0.8; margin-right: 2px; vertical-align: baseline;}
.custom-nvn-trans-rt:not(:empty)::after{content: "”"; font-family: "Noto Serif SC", "Source Han Serif SC", serif; font-size: 0.88em; color: var(--main); opacity: 0.8; margin-left: 2px; vertical-align: baseline;}
.custom-nvn-bilingual-ruby rt:empty{display: none !important;}
.custom-nvn-dialogue em, .custom-nvn-dialogue i, .custom-nvn-bilingual-ruby em, .custom-nvn-bilingual-ruby i, .custom-nvn-motion em, .custom-nvn-motion i, .custom-nvn-text em, .custom-nvn-text i, .custom-nvn-name-box em, .custom-nvn-name-box i{font-style: normal !important; font-weight: inherit !important; font-size: inherit !important; color: inherit !important; background: none !important; border: none !important; letter-spacing: inherit !important; text-shadow: inherit !important; line-height: inherit !important;}

/* =========================================================================
 * 星号包裹的「内心思绪」：标签显示 + 引号用 * + 不套心灵感应配色
 * （data-quote="*" 不会命中 [data-quote="〈"] 那批规则，所以文字/名牌/头像
 *   全部走默认配色，和普通行一致）
 * ========================================================================= */
[data-quote="*"] .custom-nvn-quote-mark.custom-left::before { content: "*" !important; }
[data-quote="*"] .custom-nvn-quote-mark.custom-right::before { content: "*" !important; }

    /* ══════════════════════════════════════════════════════════════
     * 中日双语布局
     * 溢出根因：外层 .nvn-text 是 flex，<ruby> 作为 flex 项 min-width:auto
     * 不肯收缩，而日文注音又把行撑得比中文宽 —— 于是整行横向溢出。
     * 改成 block 容器后 ruby 恢复常态，中文按字断行并与日文逐段贴合。
     * ══════════════════════════════════════════════════════════════ */
    div.custom-nvn-dialogue[data-mode^="bilingual"] .custom-nvn-text {
      display: block !important;
      min-width: 0 !important; max-width: 100% !important;
    }
    div.custom-nvn-dialogue[data-mode^="bilingual"] .custom-nvn-content { min-width: 0 !important; }
    div.custom-nvn-dialogue[data-mode^="bilingual"] .custom-nvn-bilingual-ruby {
      max-width: 100% !important;
      white-space: normal !important;
      word-break: break-word !important; overflow-wrap: anywhere !important;
    }
    div.custom-nvn-dialogue[data-mode^="bilingual"] .custom-nvn-bilingual-ruby rt {
      white-space: normal !important;
      word-break: break-word !important; overflow-wrap: anywhere !important;
    }

    /* ══════════════════════════════════════════════════════════════
     * 中日双语 · 分开版（data-mode="bilingual-split"）
     * 贴合版让中文与日文逐段对齐；分开版把日文整段放到中文下面。
     * 字号：中日同号 0.75em（rt 用 1em 抵消 ruby 基文的相对倍数）；
     * 行高收紧到 1.7，避免 ruby 的 line-height:2.3 在块级下撑出巨大空行。
     * ══════════════════════════════════════════════════════════════ */
    div.custom-nvn-dialogue[data-mode="bilingual-split"] .custom-nvn-bilingual-ruby {
      display: block !important;
      width: 100% !important; max-width: 100% !important;
      font-size: 1.05em !important; line-height: 1.7 !important;
    }
    div.custom-nvn-dialogue[data-mode="bilingual-split"] .custom-nvn-bilingual-ruby rt {
      display: block !important;
      width: 100% !important; max-width: 100% !important;
      font-size: 1em !important; line-height: 1.7 !important;
      margin-top: 3px !important; transform: none !important; text-align: left !important;
    }
`,
    dark: `
/* ====== 消除原生气泡样式 ====== */
.mes_text:has(.custom-nvn-dialogue),.mes_text:has(.custom-nvn-dialogue) blockquote,.mes_text:has(.custom-nvn-dialogue) > p:has(> .custom-nvn-dialogue),
.custom-nvn-dialogue,
.custom-nvn-avatar-side,
.custom-nvn-avatar-popover {
  background: transparent !important;
  border: 0 !important;
  box-shadow: none !important;
  outline: none !important;
}

/* ====== 基础容器 ====== */
.custom-nvn-dialogue {
  --main: #8896a5;
  --sub: #b2becb;
  --rgb: 136, 150, 165;
  --motion-color: #5a6573;
  --stage-text: #2c3238;
  --text-shadow-style: 0 1px 1px rgba(255, 255, 255, 0.6);
  --plate-bg: rgba(var(--rgb), 0.12);
  --name-rest-color: #f0f0f0;
  
  display: flex;
  align-items: flex-start;
  align-self: flex-start;
  gap: 16px;
  width: 100%;
  max-width: 100%;
  margin: 14px 0 16px;
  padding: 0;
  color: var(--stage-text);
  font-family: "Noto Serif SC", "Source Han Serif SC", "PingFang SC", "Microsoft YaHei", serif;
  clear: both;
}

/* 浅色主题模式（默认）强化深色对比 */
@media (prefers-color-scheme: dark) {
  .custom-nvn-dialogue {
    --motion-color: #a8b5c2;
    --stage-text: #eee7dc;
    --text-shadow-style: 0 1px 3px rgba(0, 0, 0, 0.8);
    --name-rest-color: #ffffff;
  }
}
/* 兼容酒馆常见深色容器类名 */
:is(.dark, .theme-dark, [data-theme="dark"]) .custom-nvn-dialogue {
  --motion-color: #a8b5c2 !important;
  --stage-text: #eee7dc !important;
  --text-shadow-style: 0 1px 3px rgba(0, 0, 0, 0.8) !important;
  --name-rest-color: #ffffff !important;
}

.custom-nvn-dialogue * { box-sizing: border-box; }

/* ====== 头像视窗（100px × 125px） ====== */
.custom-nvn-avatar-side {
  width: 100px;
  height: 125px !important;
  min-height: 125px !important;
  flex: 0 0 100px;
  position: relative;
}

.custom-nvn-avatar-popover {
  display: block !important;
  width: 100%;
  height: 100%;
  margin: 0;
  padding: 0;
}

.custom-nvn-avatar-popover summary {
  list-style: none !important;
  outline: none !important;
  display: block !important;
  width: 100%;
  height: 100%;
}
.custom-nvn-avatar-popover summary::-webkit-details-marker,
.custom-nvn-avatar-popover summary::marker {
  display: none !important;
}

.custom-nvn-avatar-img {
  width: 100px;
  height: 125px !important;
  min-height: 125px !important;
  border: 1.5px solid rgba(var(--rgb), 0.45);
  border-radius: 14px;
  background-color: transparent !important;
  background-position: center 10%;
  background-repeat: no-repeat;
  background-size: cover;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.35);
}

/* 仅对非立绘普通NPC启用暗夜微光背景与双层微饰线 */
div.custom-nvn-dialogue:not(:is(
  [data-char*="克蕾雅"], [data-char*="卢克蕾齐雅"], [data-char*="莉莉娅"], [data-char*="莉莉娅"],
  [data-char*="梅拉"], [data-char*="梅拉妮"], [data-char*="艾拉"], [data-char*="拉姆"], 
  [data-char*="拉姆内"], [data-char*="阿黛拉"], [data-char*="伊莉丝"], [data-char*="丽塔"], 
  [data-char*="菲娅"], [data-char*="菲娅娜"], [data-char*="大魔女"], [data-char*="露娜"], 
  [data-char*="桑尼"], [data-char*="萨菲亚"], [data-char*="凯埃尔"], [data-char*="卡伊埃尔"],
  [data-char*="夏洛特"], [data-char*="法妮雅"], [data-char*="响木天音"], [data-char*="芙洛蒂"],
  [data-char*="艾妮希雅"], [data-char*="凯拉涅斯"], [data-char*="拉菲莉娅"], [data-char*="赛蕾姆丝"],
  [data-char*="小忆"], [data-char*="斯雅"], [data-char*="盖欧露易丝"], [data-char*="露易丝"], 
  [data-char*="斯提亚拉"], [data-char*="提亚拉"], [data-char*="古伊奈"], [data-char*="雷克西斯"], 
  [data-char*="帕特里琪娅"], [data-char*="奇诺米"], [data-char*="蒂莎"], [data-char*="加莉泰娅"],
  [data-char*="小春"], [data-char*="五月雨"], [data-char*="大王"],
  [data-char*="艾尔希"], [data-char*="狄娜"], [data-char*="卡莲"], [data-char*="柯萝特"],
  [data-char*="芙萝"], [data-char*="艾珀尔"], [data-char*="芙洛瑞丝"], [data-char*="布娜"],
  [data-char*="幽妮娅"], [data-char*="塞伊"], [data-char*="利奥"],
  [data-char*="托莉娜"], [data-char*="一之濑雫"], ，
  [data-char*="托莉娜"], [data-char*="一之濑雫"], [data-char*="爱丽丝"], [data-char*="诺登"], [data-char*="小红帽"], [data-char*="普利凯特"],
  [data-char*="梅贝尔"], [data-char*="玛丽·安"], [data-char*="莉耶芙"], [data-char*="公爵夫人"],
  [data-char*="帽子屋"], [data-char*="三月兔"], [data-char*="格里菲"], [data-char*="假海龟"],
  [data-char*="渡渡"], [data-char*="希夏"], [data-char*="比尔"], [data-char*="维多利雅"],
  [data-char*="弗洛伦斯"], [data-char*="罗丽娜"], [data-char*="格尔达"], [data-char*="尤妮丝"],
  [data-char*="莱登"], [data-char*="克缇"], [data-char*="贾巴沃克"], [data-char*="贾布加布"],
  [data-char*="班达斯奈奇"], [data-char*="希伏契"], [data-char*="柴郡猫"], [data-char*="人偶爱丽丝"],
  [data-char*="崔德尔"], [data-char*="雏鸟"], [data-char*="蛇神"]
, [data-char*="IV"], [data-char*="女儿"], [data-char*="驱魔"], [data-char*="魔化"])) .custom-nvn-avatar-img {
  background-image: radial-gradient(ellipse at center, rgba(var(--rgb), 0.16) 0%, rgba(14, 16, 20, 0.92) 100%) !important;
}

div.custom-nvn-dialogue:not(:is(
  [data-char*="克蕾雅"], [data-char*="卢克蕾齐雅"], [data-char*="莉莉娅"], [data-char*="莉莉娅"],
  [data-char*="梅拉"], [data-char*="梅拉妮"], [data-char*="艾拉"], [data-char*="拉姆"], 
  [data-char*="拉姆内"], [data-char*="阿黛拉"], [data-char*="伊莉丝"], [data-char*="丽塔"], 
  [data-char*="菲娅"], [data-char*="菲娅娜"], [data-char*="大魔女"], [data-char*="露娜"], 
  [data-char*="桑尼"], [data-char*="萨菲亚"], [data-char*="凯埃尔"], [data-char*="卡伊埃尔"],
  [data-char*="夏洛特"], [data-char*="法妮雅"], [data-char*="响木天音"], [data-char*="芙洛蒂"],
  [data-char*="艾妮希雅"], [data-char*="凯拉涅斯"], [data-char*="拉菲莉娅"], [data-char*="赛蕾姆丝"],
  [data-char*="小忆"], [data-char*="斯雅"], [data-char*="盖欧露易丝"], [data-char*="露易丝"], 
  [data-char*="斯提亚拉"], [data-char*="提亚拉"], [data-char*="古伊奈"], [data-char*="雷克西斯"], 
  [data-char*="帕特里琪娅"], [data-char*="奇诺米"], [data-char*="蒂莎"], [data-char*="加莉泰娅"],
  [data-char*="小春"], [data-char*="五月雨"], [data-char*="大王"],
  [data-char*="艾尔希"], [data-char*="狄娜"], [data-char*="卡莲"], [data-char*="柯萝特"],
  [data-char*="芙萝"], [data-char*="艾珀尔"], [data-char*="芙洛瑞丝"], [data-char*="布娜"],
  [data-char*="幽妮娅"], [data-char*="塞伊"], [data-char*="利奥"]，
  [data-char*="托莉娜"], [data-char*="一之濑雫"], [data-char*="爱丽丝"], [data-char*="诺登"], [data-char*="小红帽"], [data-char*="普利凯特"],
  [data-char*="梅贝尔"], [data-char*="玛丽·安"], [data-char*="莉耶芙"], [data-char*="公爵夫人"],
  [data-char*="帽子屋"], [data-char*="三月兔"], [data-char*="格里菲"], [data-char*="假海龟"],
  [data-char*="渡渡"], [data-char*="希夏"], [data-char*="比尔"], [data-char*="维多利雅"],
  [data-char*="弗洛伦斯"], [data-char*="罗丽娜"], [data-char*="格尔达"], [data-char*="尤妮丝"],
  [data-char*="莱登"], [data-char*="克缇"], [data-char*="贾巴沃克"], [data-char*="贾布加布"],
  [data-char*="班达斯奈奇"], [data-char*="希伏契"], [data-char*="柴郡猫"], [data-char*="人偶爱丽丝"],
  [data-char*="崔德尔"], [data-char*="雏鸟"], [data-char*="蛇神"]
)) .custom-nvn-avatar-img::after {
  content: "";
  position: absolute;
  inset: 4px;
  border: 1px solid rgba(var(--rgb), 0.22);
  border-radius: 10px;
  pointer-events: none;
}

/* 有大立绘的角色开启手型指针 */
div.custom-nvn-dialogue:is(
  [data-char*="艾拉"], [data-char*="克蕾雅"], [data-char*="卢克蕾齐雅"], 
  [data-char*="莉莉娅"], [data-char*="拉姆"], [data-char*="梅拉"], 
  [data-char*="阿黛拉"], [data-char*="伊莉丝"], [data-char*="丽塔"], 
  [data-char*="露娜"], [data-char*="菲娅"],
  [data-char*="夏洛特"], [data-char*="法妮雅"], [data-char*="响木天音"], [data-char*="芙洛蒂"],
  [data-char*="艾妮希雅"], [data-char*="凯拉涅斯"], [data-char*="赛蕾姆丝"], [data-char*="小忆"],
  [data-char*="斯雅"], [data-char*="盖欧露易丝"], [data-char*="露易丝"], [data-char*="斯提亚拉"], 
  [data-char*="提亚拉"], [data-char*="古伊奈"], [data-char*="雷克西斯"], [data-char*="帕特里琪娅"], 
  [data-char*="奇诺米"], [data-char*="蒂莎"], [data-char*="加莉泰娅"],
  [data-char*="艾尔希"], [data-char*="狄娜"], [data-char*="卡莲"], [data-char*="柯萝特"], [data-char*="幽妮娅"],
  [data-char*="托莉娜"], [data-char*="一之濑雫"], [data-char*="IV"], [data-char*="一之濑雫"], [data-char*="丽塔"], [data-char*="丽薇歌塔"], [data-char*="丽薇歌塔·柯涅尔"], [data-char*="伊夏"], [data-char*="伊夏·波利斯塔切尔"], [data-char*="伊莉丝"], [data-char*="克蕾雅"], [data-char*="凯拉涅斯"], [data-char*="加莉泰娅"], [data-char*="卡莲"], [data-char*="卢克蕾齐雅"], [data-char*="古伊奈"], [data-char*="夏洛特"], [data-char*="响木天音"], [data-char*="奇诺米"], [data-char*="小忆"], [data-char*="帕特里琪娅"], [data-char*="幽妮娅"], [data-char*="托莉娜"], [data-char*="拉姆"], [data-char*="拉姆内"], [data-char*="提亚拉"], [data-char*="摇篮的爱莉丝"], [data-char*="斯提亚拉"], [data-char*="斯雅"], [data-char*="普莉姆拉"], [data-char*="柯萝特"], [data-char*="梅拉"], [data-char*="梅拉妮"], [data-char*="法妮雅"], [data-char*="爱·丽·丝"], [data-char*="爱丽丝"], [data-char*="爱莉丝"], [data-char*="狄娜"], [data-char*="王铠"], [data-char*="王铠古伊奈"], [data-char*="王铠盖欧露易丝"], [data-char*="盖欧露易丝"], [data-char*="艾妮希雅"], [data-char*="艾尔希"], [data-char*="艾尔希IV"], [data-char*="艾拉"], [data-char*="芙洛蒂"], [data-char*="菲娅"], [data-char*="菲娅娜"], [data-char*="蒂莎"], [data-char*="诺艾儿"], [data-char*="诺艾儿·柯涅尔"], [data-char*="诺艾儿·私"], [data-char*="诺艾尔"], [data-char*="诺艾尔·柯涅尔"], [data-char*="诺艾尔·私"], [data-char*="赛蕾姆丝"], [data-char*="阿尔玛"], [data-char*="阿尔玛·奥普菲帕姆"], [data-char*="阿黛拉"], [data-char*="雷克西斯"], [data-char*="露娜"], [data-char*="露易丝"], [data-char*="驱魔"], [data-char*="驱魔夏洛特"], [data-char*="魔化"], [data-char*="魔化托莉娜"]
, [data-char*="三月兔"], [data-char*="五月雨"], [data-char*="人偶爱丽丝"], [data-char*="假海龟"], [data-char*="克缇"], [data-char*="公爵夫人"], [data-char*="凯埃尔"], [data-char*="利奥"], [data-char*="卡伊埃尔"], [data-char*="塞伊"], [data-char*="大王"], [data-char*="女儿"], [data-char*="女儿爱丽丝"], [data-char*="妈妈爱丽丝"], [data-char*="妹妹爱丽丝"], [data-char*="小春"], [data-char*="小红帽"], [data-char*="尤妮丝"], [data-char*="崔德尔·蒂"], [data-char*="崔德尔·达姆"], [data-char*="布娜"], [data-char*="希伏契"], [data-char*="希夏"], [data-char*="帽子屋"], [data-char*="弗洛伦斯"], [data-char*="拉菲莉娅"], [data-char*="普利凯特"], [data-char*="柴郡猫"], [data-char*="格尔达"], [data-char*="格里菲"], [data-char*="桑尼"], [data-char*="梅贝尔"], [data-char*="母亲爱丽丝"], [data-char*="比尔"], [data-char*="渡渡"], [data-char*="爱丽丝·利德尔"], [data-char*="玛丽·安"], [data-char*="班达斯奈奇"], [data-char*="维多利雅"], [data-char*="罗丽娜"], [data-char*="艾珀尔"], [data-char*="芙洛瑞丝"], [data-char*="芙萝"], [data-char*="莉耶芙"], [data-char*="莱登"], [data-char*="萨菲亚"], [data-char*="蛇神"], [data-char*="诺登"], [data-char*="贾巴沃克"], [data-char*="贾布加布"], [data-char*="雏鸟"]) .custom-nvn-avatar-img {
  cursor: pointer !important;
}

/* 无大立绘NPC禁用弹出交互 */
div.custom-nvn-dialogue:not(:is(
  [data-char*="艾拉"], [data-char*="克蕾雅"], [data-char*="卢克蕾齐雅"], 
  [data-char*="莉莉娅"], [data-char*="拉姆"], [data-char*="梅拉"], 
  [data-char*="阿黛拉"], [data-char*="伊莉丝"], [data-char*="丽塔"], 
  [data-char*="露娜"], [data-char*="菲娅"],
  [data-char*="夏洛特"], [data-char*="法妮雅"], [data-char*="响木天音"], [data-char*="芙洛蒂"],
  [data-char*="艾妮希雅"], [data-char*="凯拉涅斯"], [data-char*="赛蕾姆丝"], [data-char*="小忆"],
  [data-char*="斯雅"], [data-char*="盖欧露易丝"], [data-char*="露易丝"], [data-char*="斯提亚拉"], 
  [data-char*="提亚拉"], [data-char*="古伊奈"], [data-char*="雷克西斯"], [data-char*="帕特里琪娅"], 
  [data-char*="奇诺米"], [data-char*="蒂莎"], [data-char*="加莉泰娅"],
  [data-char*="艾尔希"], [data-char*="狄娜"], [data-char*="卡莲"], [data-char*="柯萝特"], [data-char*="幽妮娅"],
  [data-char*="托莉娜"], [data-char*="一之濑雫"], [data-char*="IV"], [data-char*="一之濑雫"], [data-char*="丽塔"], [data-char*="丽薇歌塔"], [data-char*="丽薇歌塔·柯涅尔"], [data-char*="伊夏"], [data-char*="伊夏·波利斯塔切尔"], [data-char*="伊莉丝"], [data-char*="克蕾雅"], [data-char*="凯拉涅斯"], [data-char*="加莉泰娅"], [data-char*="卡莲"], [data-char*="卢克蕾齐雅"], [data-char*="古伊奈"], [data-char*="夏洛特"], [data-char*="响木天音"], [data-char*="奇诺米"], [data-char*="小忆"], [data-char*="帕特里琪娅"], [data-char*="幽妮娅"], [data-char*="托莉娜"], [data-char*="拉姆"], [data-char*="拉姆内"], [data-char*="提亚拉"], [data-char*="摇篮的爱莉丝"], [data-char*="斯提亚拉"], [data-char*="斯雅"], [data-char*="普莉姆拉"], [data-char*="柯萝特"], [data-char*="梅拉"], [data-char*="梅拉妮"], [data-char*="法妮雅"], [data-char*="爱·丽·丝"], [data-char*="爱丽丝"], [data-char*="爱莉丝"], [data-char*="狄娜"], [data-char*="王铠"], [data-char*="王铠古伊奈"], [data-char*="王铠盖欧露易丝"], [data-char*="盖欧露易丝"], [data-char*="艾妮希雅"], [data-char*="艾尔希"], [data-char*="艾尔希IV"], [data-char*="艾拉"], [data-char*="芙洛蒂"], [data-char*="菲娅"], [data-char*="菲娅娜"], [data-char*="蒂莎"], [data-char*="诺艾儿"], [data-char*="诺艾儿·柯涅尔"], [data-char*="诺艾儿·私"], [data-char*="诺艾尔"], [data-char*="诺艾尔·柯涅尔"], [data-char*="诺艾尔·私"], [data-char*="赛蕾姆丝"], [data-char*="阿尔玛"], [data-char*="阿尔玛·奥普菲帕姆"], [data-char*="阿黛拉"], [data-char*="雷克西斯"], [data-char*="露娜"], [data-char*="露易丝"], [data-char*="驱魔"], [data-char*="驱魔夏洛特"], [data-char*="魔化"], [data-char*="魔化托莉娜"]
)) .custom-nvn-avatar-popover {
  pointer-events: none !important;
}

/* ====== NPC 竖框名字填充 ====== */
.custom-nvn-avatar-fallback-box {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 10px 6px;
  position: relative;
  z-index: 2;
}

.custom-nvn-avatar-fallback {
  display: block;
  width: 100%;
  max-width: 2.3em;
  margin: 0 auto;
  color: var(--main);
  font-size: 1.22em;
  font-weight: 700;
  line-height: 1.32;
  letter-spacing: 0.1em;
  text-align: center;
  word-break: break-all;
  text-shadow: 0 0 8px rgba(var(--rgb), 0.5), 0 2px 4px rgba(0, 0, 0, 0.9);
}

/* 具名立绘角色彻底隐藏 fallback 文字盒子 */
div.custom-nvn-dialogue:is([data-char*="02-D"], [data-char*="利德尔次女"], [data-char*="妈妈"], [data-char*="妹妹"], [data-char*="母亲"], [data-char*="王铠"], 
  [data-char*="克蕾雅"], [data-char*="莉莉娅"], [data-char*="莉莉娅"],
  [data-char*="梅拉"], [data-char*="梅拉妮"], [data-char*="艾拉"], [data-char*="拉姆"], 
  [data-char*="拉姆内"], [data-char*="阿黛拉"], [data-char*="伊莉丝"], [data-char*="丽塔"], 
  [data-char*="菲娅"], [data-char*="菲娅娜"], [data-char*="露娜"], 
  [data-char*="桑尼"], [data-char*="萨菲亚"], [data-char*="凯埃尔"], [data-char*="卡伊埃尔"],
  [data-char*="夏洛特"], [data-char*="法妮雅"], [data-char*="响木天音"], [data-char*="芙洛蒂"],
  [data-char*="艾妮希雅"], [data-char*="凯拉涅斯"], [data-char*="拉菲莉娅"], [data-char*="赛蕾姆丝"],
  [data-char*="小忆"], [data-char*="斯雅"], [data-char*="盖欧露易丝"], [data-char*="露易丝"], 
  [data-char*="斯提亚拉"], [data-char*="提亚拉"], [data-char*="古伊奈"], [data-char*="雷克西斯"], 
  [data-char*="帕特里琪娅"], [data-char*="奇诺米"], [data-char*="蒂莎"], [data-char*="加莉泰娅"],
  [data-char*="小春"], [data-char*="五月雨"], [data-char*="大王"],
  [data-char*="艾尔希"], [data-char*="狄娜"], [data-char*="卡莲"], [data-char*="柯萝特"],
  [data-char*="芙萝"], [data-char*="艾珀尔"], [data-char*="芙洛瑞丝"], [data-char*="布娜"],
  [data-char*="幽妮娅"], [data-char*="塞伊"], [data-char*="利奥"],
  [data-char*="托莉娜"], [data-char*="一之濑雫"], [data-char*="爱丽丝"], [data-char*="诺登"], [data-char*="小红帽"], [data-char*="普利凯特"],
  [data-char*="梅贝尔"], [data-char*="玛丽·安"], [data-char*="莉耶芙"], [data-char*="公爵夫人"],
  [data-char*="帽子屋"], [data-char*="三月兔"], [data-char*="格里菲"], [data-char*="假海龟"],
  [data-char*="渡渡"], [data-char*="希夏"], [data-char*="比尔"], [data-char*="维多利雅"],
  [data-char*="弗洛伦斯"], [data-char*="罗丽娜"], [data-char*="格尔达"], [data-char*="尤妮丝"],
  [data-char*="莱登"], [data-char*="克缇"], [data-char*="贾巴沃克"], [data-char*="贾布加布"],
  [data-char*="班达斯奈奇"], [data-char*="希伏契"], [data-char*="柴郡猫"], [data-char*="人偶爱丽丝"],
  [data-char*="雏鸟"], [data-char*="蛇神"], [data-char*="一之濑雫"], [data-char*="三月兔"], [data-char*="丽薇歌塔"], [data-char*="丽薇歌塔·柯涅尔"], [data-char*="五月雨"], [data-char*="人偶爱丽丝"], [data-char*="伊夏"], [data-char*="伊夏·波利斯塔切尔"], [data-char*="假海龟"], [data-char*="克缇"], [data-char*="公爵夫人"], [data-char*="凯埃尔"], [data-char*="利奥"], [data-char*="南丁格尔"], [data-char*="卡伊埃尔"], [data-char*="塞伊"], [data-char*="大王"], [data-char*="女儿"], [data-char*="女儿爱丽丝"], [data-char*="妈妈爱丽丝"], [data-char*="妹妹爱丽丝"], [data-char*="小春"], [data-char*="小红帽"], [data-char*="尤妮丝"], [data-char*="崔德尔·蒂"], [data-char*="崔德尔·达姆"], [data-char*="布娜"], [data-char*="希伏契"], [data-char*="希夏"], [data-char*="帽子屋"], [data-char*="幽妮娅"], [data-char*="弗洛伦斯"], [data-char*="德尔菲尼"], [data-char*="德尔菲尼·柯涅尔"], [data-char*="拉菲莉娅"], [data-char*="提亚拉"], [data-char*="提尔德"], [data-char*="提尔德·柯涅尔"], [data-char*="摇篮的爱莉丝"], [data-char*="斯雅"], [data-char*="普利凯特"], [data-char*="普莉姆拉"], [data-char*="柴郡猫"], [data-char*="格尔达"], [data-char*="格里菲"], [data-char*="桑尼"], [data-char*="梅法"], [data-char*="梅法·格里亚德"], [data-char*="梅贝尔"], [data-char*="母亲爱丽丝"], [data-char*="比尔"], [data-char*="渡渡"], [data-char*="爱·丽·丝"], [data-char*="爱丽丝"], [data-char*="爱丽丝·利德尔"], [data-char*="爱莉丝"], [data-char*="玛丽·安"], [data-char*="班达斯奈奇"], [data-char*="维多利雅"], [data-char*="罗丽娜"], [data-char*="艾珀尔"], [data-char*="芙洛瑞丝"], [data-char*="芙萝"], [data-char*="莉耶芙"], [data-char*="莱登"], [data-char*="萨菲亚"], [data-char*="蒂格蕾娜"], [data-char*="蒂格蕾娜·索菈"], [data-char*="蛇神"], [data-char*="诺登"], [data-char*="诺艾儿"], [data-char*="诺艾儿·柯涅尔"], [data-char*="诺艾儿·私"], [data-char*="诺艾尔"], [data-char*="诺艾尔·柯涅尔"], [data-char*="诺艾尔·私"], [data-char*="贾巴沃克"], [data-char*="贾布加布"], [data-char*="赛蕾姆丝"], [data-char*="阿尔玛"], [data-char*="阿尔玛·奥普菲帕姆"], [data-char*="雏鸟"], [data-char*="雷克西斯"], [data-char*="露娜"], [data-char*="露易丝"]
) .custom-nvn-avatar-fallback-box {
  display: none !important;
}

/* ====== 内容栏：文字区全覆盖 + 极窄边缘透明 ====== */
.custom-nvn-content {
  display: flex !important;
  flex-direction: column;
  flex: 1 1 0;
  min-width: 0;
  position: relative !important;
  padding: 8px 18px 10px 14px !important;
  /* 0%~86%一路浓郁深黑保底，超长台词也能100%看清；仅在最边缘狭窄区域淡出 */
  background: linear-gradient(90deg, 
    rgba(12, 14, 18, 0.95) 0%, 
    rgba(12, 14, 18, 0.95) 86%, 
    rgba(12, 14, 18, 0.65) 94%, 
    rgba(12, 14, 18, 0.15) 98%, 
    transparent 100%) !important;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
  border: 0 !important;
  border-left: 3px solid var(--main) !important;
  border-radius: 0 !important;
  box-shadow: none !important;
}

/* 顶部图2同款 1px 渐隐微光细线 */
.custom-nvn-content::before {
  content: "";
  display: block;
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 1px;
  background: linear-gradient(90deg, rgba(var(--rgb), 0.55) 0%, rgba(var(--rgb), 0.15) 50%, transparent 100%) !important;
  pointer-events: none;
}

/* 底部图2同款 1px 渐隐微光细线 */
.custom-nvn-content::after {
  content: "";
  display: block;
  position: absolute;
  bottom: 0;
  left: 0;
  width: 100%;
  height: 1px;
  background: linear-gradient(90deg, rgba(var(--rgb), 0.55) 0%, rgba(var(--rgb), 0.15) 50%, transparent 100%) !important;
  pointer-events: none;
}

.custom-nvn-name-plate {
  display: inline-flex;
  align-items: center;
  align-self: flex-start;
  gap: 8px;
  position: relative;
  min-height: 36px;
  padding: 2px 24px 2px 10px;
  margin-bottom: 6px;
  background: linear-gradient(90deg, rgba(var(--rgb), 0.22) 0%, rgba(var(--rgb), 0.04) 70%, transparent 100%);
  border-top: 1px solid rgba(var(--rgb), 0.35);
  border-bottom: 1px solid rgba(var(--rgb), 0.35);
  border-left: 3px solid var(--main);
  border-right: none !important;
  border-radius: 4px 16px 16px 4px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
}

.custom-nvn-rose-crest {
  display: none !important;
}

/* 享有花朵名牌的角色 */
div.custom-nvn-dialogue:is(
  [data-char*="克蕾雅"], [data-char*="卢克蕾齐雅"], [data-char*="莉莉娅"], [data-char*="莉莉娅"],
  [data-char*="梅拉"], [data-char*="梅拉妮"], [data-char*="艾拉"], [data-char*="拉姆"], 
  [data-char*="拉姆内"], [data-char*="阿黛拉"], [data-char*="伊莉丝"], [data-char*="丽塔"], 
  [data-char*="菲娅"], [data-char*="菲娅娜"], [data-char*="大魔女"], [data-char*="露娜"], 
  [data-char*="桑尼"], [data-char*="萨菲亚"], [data-char*="凯埃尔"], [data-char*="卡伊埃尔"],
  [data-char*="夏洛特"], [data-char*="法妮雅"], [data-char*="响木天音"], [data-char*="芙洛蒂"],
  [data-char*="艾妮希雅"], [data-char*="凯拉涅斯"], [data-char*="小忆"], [data-char*="斯雅"],
  [data-char*="盖欧露易丝"], [data-char*="露易丝"], [data-char*="斯提亚拉"], [data-char*="提亚拉"], 
  [data-char*="古伊奈"], [data-char*="雷克西斯"], [data-char*="帕特里琪娅"], [data-char*="奇诺米"], 
  [data-char*="蒂莎"], [data-char*="加莉泰娅"], [data-char*="小春"], [data-char*="五月雨"], [data-char*="大王"],
  [data-char*="艾尔希"], [data-char*="狄娜"], [data-char*="卡莲"], [data-char*="柯萝特"],
  [data-char*="芙萝"], [data-char*="艾珀尔"], [data-char*="芙洛瑞丝"], [data-char*="布娜"],
  [data-char*="幽妮娅"], [data-char*="塞伊"], [data-char*="利奥"],
  [data-char*="托莉娜"], [data-char*="一之濑雫"], [data-char*="爱丽丝"], [data-char*="诺登"], [data-char*="小红帽"], [data-char*="普利凯特"],
  [data-char*="梅贝尔"], [data-char*="玛丽·安"], [data-char*="莉耶芙"], [data-char*="公爵夫人"],
  [data-char*="帽子屋"], [data-char*="三月兔"], [data-char*="格里菲"], [data-char*="假海龟"],
  [data-char*="渡渡"], [data-char*="希夏"], [data-char*="比尔"], [data-char*="维多利雅"],
  [data-char*="弗洛伦斯"], [data-char*="罗丽娜"], [data-char*="格尔达"], [data-char*="尤妮丝"],
  [data-char*="莱登"], [data-char*="克缇"], [data-char*="贾巴沃克"], [data-char*="贾布加布"],
  [data-char*="班达斯奈奇"], [data-char*="希伏契"], [data-char*="柴郡猫"], [data-char*="人偶爱丽丝"],
  [data-char*="崔德尔"], [data-char*="雏鸟"], [data-char*="蛇神"],
  [data-player^="user"], [data-player="true"], [is_user="true"] *, .is-user-avatar
, [data-char*="IV"], [data-char*="女儿"], [data-char*="拉菲莉娅"], [data-char*="赛蕾姆丝"], [data-char*="驱魔"], [data-char*="魔化"]) .custom-nvn-rose-crest {  
  display: flex !important;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  color: var(--main);
  filter: drop-shadow(0 0 4px rgba(var(--rgb), 0.6));
  flex-shrink: 0;
}
.custom-nvn-rose-crest svg { width: 100%; height: 100%; }

.custom-nvn-name-box {
  display: inline-flex;
  align-items: baseline;
  color: var(--stage-text);
  font-size: 1.1em;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.7);
}

.custom-nvn-name-initial {
  color: var(--main);
  font-size: 1.4em;
  font-weight: 900;
  line-height: 1;
  margin-right: 2px;
  text-shadow: 0 0 8px rgba(var(--rgb), 0.5);
}

.custom-nvn-name-rest {
  color: var(--name-rest-color, #2b2b2b);
  opacity: 0.95;
}

/* ====== 神态动作微章 ====== */
.custom-nvn-action {
  display: inline-flex;
  align-items: center;
  background: rgba(var(--rgb), 0.28); /* 提亮背景底衬 */
  border: 1px solid rgba(var(--rgb), 0.6);
  border-radius: 8px;
  padding: 1px 7px;
  color: var(--sub, #ffffff); /* 变亮色字，不再发暗 */
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
  font-size: 0.72em;
  font-weight: 600;
  letter-spacing: 0.04em;
  margin-left: 2px;
}
.custom-nvn-action:empty { display: none !important; }
.custom-nvn-telepathy-tag { display: none; }

/* ====== 心灵感应 ====== */
[data-quote="*"] .custom-nvn-telepathy-tag, [data-quote="〈"] .custom-nvn-telepathy-tag, [data-quote="《"] .custom-nvn-telepathy-tag, [data-quote="‹"] .custom-nvn-telepathy-tag, [data-quote="『"] .custom-nvn-telepathy-tag { 
  display: inline-flex !important; 
  align-items: center !important; 
  margin-left: 2px !important; 
  padding: 1px 7px !important; 
  border-radius: 8px !important; 
  font-size: 0.72em !important; 
  font-weight: 600 !important; 
  letter-spacing: 0.04em !important; 
  background: rgba(var(--rgb), 0.16) !important; 
  border: 1px solid rgba(var(--rgb), 0.4) !important; 
  color: var(--main) !important; 
}
[data-quote="〈"] .custom-nvn-quote-mark.custom-left::before, [data-quote="‹"] .custom-nvn-quote-mark.custom-left::before { content: "〈" !important; }
[data-quote="〈"] .custom-nvn-quote-mark.custom-right::before, [data-quote="‹"] .custom-nvn-quote-mark.custom-right::before { content: "〉" !important; }
[data-quote="《"] .custom-nvn-quote-mark.custom-left::before { content: "《" !important; }
[data-quote="《"] .custom-nvn-quote-mark.custom-right::before { content: "》" !important; }
[data-quote="『"] .custom-nvn-quote-mark.custom-left::before { content: "『" !important; }
[data-quote="『"] .custom-nvn-quote-mark.custom-right::before { content: "』" !important; }
[data-quote="〈"] .custom-nvn-primary, [data-quote="‹"] .custom-nvn-primary { color: #e8dcff !important; text-shadow: 0 0 8px rgba(var(--rgb), .45), 0 1px 3px rgba(0,0,0,.85) !important; }
[data-quote="〈"] .custom-nvn-text, [data-quote="‹"] .custom-nvn-text { border-left-color: rgba(var(--rgb), .8) !important; }
[data-quote="〈"] .custom-nvn-text::before, [data-quote="‹"] .custom-nvn-text::before { background: var(--main) !important; box-shadow: 0 0 8px rgba(var(--rgb), .7) !important; }
[data-quote="〈"] [class*="name-plate"], [data-quote="‹"] [class*="name-plate"] { border-top-color: rgba(var(--rgb), .55) !important; border-bottom-color: rgba(var(--rgb), .55) !important; border-left-color: rgba(var(--rgb), .8) !important; border-right-color: rgba(var(--rgb), .8) !important; box-shadow: 0 0 10px rgba(var(--rgb), .16), inset 0 0 12px rgba(var(--rgb), .06) !important; }
[data-quote="〈"] [class*="avatar-img"], [data-quote="‹"] [class*="avatar-img"] { border-color: rgba(var(--rgb), .7) !important; box-shadow: 0 0 10px rgba(var(--rgb), .18) !important; }

/* ====== 台词文本区 ====== */
.custom-nvn-text {
  position: relative;
  display: flex !important;
  align-items: baseline;
  background: transparent !important;
  border-left: 2px solid rgba(var(--rgb), 0.5) !important;
  border-radius: 0 !important;
  padding: 4px 0 4px 12px !important;
  margin-top: 4px;
  box-shadow: none !important;
}

.custom-nvn-text::before {
  content: "";
  position: absolute;
  left: -4px;
  top: 9px;
  width: 6px;
  height: 6px;
  background: var(--main);
  transform: rotate(45deg);
  border-radius: 1px;
  box-shadow: 0 0 8px rgba(var(--rgb), 0.7);
}

.custom-nvn-quote-mark {
  color: var(--main);
  font-family: inherit;
  font-size: 1.15em;
  font-weight: 700;
  opacity: 0.85;
  flex-shrink: 0;
  user-select: none;
}
.custom-nvn-quote-mark.custom-left { margin-right: 6px; }
.custom-nvn-quote-mark.custom-right { margin-left: 6px; }
.custom-nvn-quote-mark.custom-left::before { content: "「"; }
.custom-nvn-quote-mark.custom-right::before { content: "」"; }

.custom-nvn-primary {
  display: inline;
  color: #f3f4f6 !important; /* 纯净高亮白字 */
  font-size: 1.05em;
  line-height: 1.8;
  letter-spacing: 0.05em;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.9) !important; /* 精致锐利暗影，强光不发虚 */
  font-weight: 500;
  word-break: break-word;
  text-indent: 0 !important;
  margin-bottom: 6px;
}

/* ====== 动作描写区 ====== */
.custom-nvn-motion {
  display: block !important;
  margin-top: 6px;
  padding-left: 12px;
  padding-bottom: 4px;
  color: var(--sub, #d0d7de) !important; /* 改用明度更高的副色，清晰明亮 */
  font-size: 0.92em;
  line-height: 1.6;
  letter-spacing: 0.02em;
  text-shadow: none !important; /* 彻底去除糊成一团的黑色阴影 */
  word-break: break-word;
  position: relative;
}

.custom-nvn-motion::after {
  content: "";
  display: block;
  margin-top: 7px;
  width: 100%;
  height: 1px;
  background: linear-gradient(90deg, rgba(var(--rgb), 0.5) 0%, rgba(var(--rgb), 0.12) 50%, transparent 100%);
}
.custom-nvn-motion:empty { display: none !important; }

/* =========================================================================
 * 🌟  / 玩家行专属体系
 * ========================================================================= */
[is_user="true"] .custom-nvn-dialogue,
.custom-nvn-dialogue:is([data-player^="user"], [data-player="true"]) {
  --main: #e2e8f0 !important;
  --sub: #ffffff !important;
  --rgb: 226, 232, 240 !important;
  --motion-color: #cbd5e1 !important;
  flex-direction: row-reverse !important;
  align-self: flex-end !important;
  margin-left: auto !important;
}

[is_user="true"] .custom-nvn-dialogue .custom-nvn-avatar-img,
.custom-nvn-dialogue:is([data-player^="user"], [data-player="true"]) .custom-nvn-avatar-img .custom-nvn-avatar-img {
  border: 1.5px solid rgba(226, 232, 240, 0.65) !important;
}

div.custom-nvn-dialogue:is([data-player^="user"], [data-player="true"], [is_user="true"] *):not(:is(
  [data-char*="克蕾雅"], [data-char*="卢克蕾齐雅"], [data-char*="莉莉娅"], [data-char*="莉莉娅"],
  [data-char*="梅拉"], [data-char*="梅拉妮"], [data-char*="艾拉"], [data-char*="拉姆"], 
  [data-char*="拉姆内"], [data-char*="阿黛拉"], [data-char*="伊莉丝"], [data-char*="丽塔"], 
  [data-char*="菲娅"], [data-char*="菲娅娜"], [data-char*="大魔女"], [data-char*="露娜"], 
  [data-char*="桑尼"], [data-char*="萨菲亚"], [data-char*="凯埃尔"], [data-char*="卡伊埃尔"],
  [data-char*="夏洛特"], [data-char*="法妮雅"], [data-char*="响木天音"], [data-char*="芙洛蒂"],
  [data-char*="艾妮希雅"], [data-char*="凯拉涅斯"], [data-char*="拉菲莉娅"], [data-char*="赛蕾姆丝"],
  [data-char*="小忆"], [data-char*="斯雅"], [data-char*="盖欧露易丝"], [data-char*="露易丝"], 
  [data-char*="斯提亚拉"], [data-char*="提亚拉"], [data-char*="古伊奈"], [data-char*="雷克西斯"], 
  [data-char*="帕特里琪娅"], [data-char*="奇诺米"], [data-char*="蒂莎"], [data-char*="加莉泰娅"],
  [data-char*="小春"], [data-char*="五月雨"], [data-char*="大王"],
  [data-char*="艾尔希"], [data-char*="狄娜"], [data-char*="卡莲"], [data-char*="柯萝特"],
  [data-char*="芙萝"], [data-char*="艾珀尔"], [data-char*="芙洛瑞丝"], [data-char*="布娜"],
  [data-char*="幽妮娅"], [data-char*="塞伊"], [data-char*="利奥"],
  [data-char*="托莉娜"], [data-char*="一之濑雫"], , [data-char*="IV"], [data-char*="三月兔"], [data-char*="人偶爱丽丝"], [data-char*="假海龟"], [data-char*="克缇"], [data-char*="公爵夫人"], [data-char*="女儿"], [data-char*="女儿爱丽丝"], [data-char*="妈妈爱丽丝"], [data-char*="妹妹爱丽丝"], [data-char*="小红帽"], [data-char*="尤妮丝"], [data-char*="崔德尔·蒂"], [data-char*="崔德尔·达姆"], [data-char*="希伏契"], [data-char*="希夏"], [data-char*="帽子屋"], [data-char*="弗洛伦斯"], [data-char*="普利凯特"], [data-char*="柴郡猫"], [data-char*="格尔达"], [data-char*="格里菲"], [data-char*="梅贝尔"], [data-char*="母亲爱丽丝"], [data-char*="比尔"], [data-char*="渡渡"], [data-char*="爱丽丝·利德尔"], [data-char*="玛丽·安"], [data-char*="班达斯奈奇"], [data-char*="维多利雅"], [data-char*="罗丽娜"], [data-char*="莉耶芙"], [data-char*="莱登"], [data-char*="蛇神"], [data-char*="诺登"], [data-char*="贾巴沃克"], [data-char*="贾布加布"], [data-char*="雏鸟"], [data-char*="驱魔"], [data-char*="魔化"])) .custom-nvn-avatar-img {
  background-image: radial-gradient(ellipse at center, rgba(226, 232, 240, 0.18) 0%, rgba(16, 18, 22, 0.92) 100%) !important;
}

[is_user="true"] .custom-nvn-dialogue .custom-nvn-name-plate,
.custom-nvn-dialogue:is([data-player^="user"], [data-player="true"]) .custom-nvn-name-plate {
  align-self: flex-end !important;
  flex-direction: row-reverse !important;
  padding: 2px 10px 2px 24px !important;
  background: linear-gradient(270deg, rgba(226, 232, 240, 0.22) 0%, rgba(226, 232, 240, 0.04) 70%, transparent 100%) !important;
  border-top: 1px solid rgba(226, 232, 240, 0.45) !important;
  border-bottom: 1px solid rgba(226, 232, 240, 0.45) !important;
  border-left: none !important;
  border-right: 3px solid #e2e8f0 !important;
  border-radius: 16px 4px 4px 16px !important;
}

/* ====== 修复后的 User 内容框：文字区全覆盖 + 极窄边缘透明 ====== */
[is_user="true"] .custom-nvn-dialogue .custom-nvn-content,
.custom-nvn-dialogue:is([data-player^="user"], [data-player="true"]) .custom-nvn-content .custom-nvn-content {
  padding: 8px 14px 10px 18px !important;
  /* 0%~85%一路全是无死角高浓墨色，彻底包裹全部长文本；仅在最后12%极窄边缘羽化消失 */
  background: linear-gradient(270deg, 
    rgba(12, 14, 18, 0.95) 0%, 
    rgba(12, 14, 18, 0.95) 86%, 
    rgba(12, 14, 18, 0.65) 94%, 
    rgba(12, 14, 18, 0.15) 98%, 
    transparent 100%) !important;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
  border: 0 !important;
  border-right: 3px solid var(--main) !important;
  border-left: 0 !important;
  border-radius: 0 !important;
  box-shadow: none !important;
}

[is_user="true"] .custom-nvn-dialogue .custom-nvn-content::before,
.custom-nvn-dialogue:is([data-player^="user"], [data-player="true"]) .custom-nvn-content::before .custom-nvn-content::before {
  background: linear-gradient(270deg, rgba(var(--rgb), 0.55) 0%, rgba(var(--rgb), 0.15) 50%, transparent 100%) !important;
}

[is_user="true"] .custom-nvn-dialogue .custom-nvn-content::after,
.custom-nvn-dialogue:is([data-player^="user"], [data-player="true"]) .custom-nvn-content::after .custom-nvn-content::after {
  background: linear-gradient(270deg, rgba(var(--rgb), 0.55) 0%, rgba(var(--rgb), 0.15) 50%, transparent 100%) !important;
}

/* ====== 修复后的 User 台词对白区（强制靠右排布） ====== */
[is_user="true"] .custom-nvn-dialogue .custom-nvn-text,
.custom-nvn-dialogue:is([data-player^="user"], [data-player="true"]) .custom-nvn-text {
  border-left: none !important;
  border-right: 2px solid rgba(var(--rgb), 0.75) !important;
  padding-left: 0 !important;
  padding-right: 12px !important;
  justify-content: flex-end !important;
  margin-left: auto !important; /* 强制将台词整块推向最右侧 */
  text-align: right !important;
}

[is_user="true"] .custom-nvn-dialogue .custom-nvn-primary,
.custom-nvn-dialogue:is([data-player^="user"], [data-player="true"]) .custom-nvn-primary .custom-nvn-primary {
  text-align: right !important;
}

/* ====== 修复后的 User 引导指示菱形（定位至右侧细线） ====== */
[is_user="true"] .custom-nvn-dialogue .custom-nvn-text::before,
.custom-nvn-dialogue:is([data-player^="user"], [data-player="true"]) .custom-nvn-text::before {
  left: auto !important;
  right: -4px !important;
  background: var(--main) !important;
  box-shadow: 0 0 8px rgba(var(--rgb), 0.8) !important;
}

[is_user="true"] .custom-nvn-dialogue .custom-nvn-motion,
.custom-nvn-dialogue:is([data-player^="user"], [data-player="true"]) .custom-nvn-motion {
  text-align: right !important;
  padding-left: 0 !important;
  padding-right: 14px !important;
}

[is_user="true"] .custom-nvn-dialogue .custom-nvn-motion::after,
.custom-nvn-dialogue:is([data-player^="user"], [data-player="true"]) .custom-nvn-motion::after {
  background: linear-gradient(270deg, rgba(226, 232, 240, 0.55) 0%, rgba(226, 232, 240, 0.12) 50%, transparent 100%) !important;
}

/* =========================================================================
 * 📜 纯 CSS 西幻高频译名人名字头池（莫兰迪体系）
 * ========================================================================= */
div.custom-nvn-dialogue:is(
  [data-char^="约"], [data-char^="托"], [data-char^="莫"], [data-char^="罗"], 
  [data-char^="保"], [data-char^="道"], [data-char^="汤"], [data-char^="丹"], 
  [data-char^="达"], [data-char^="唐"], [data-char^="迪"], [data-char^="度"], 
  [data-char^="戴"], [data-char^="德"], [data-char^="主"]
):not([data-char*="狄娜"]):not([data-char*="托莉娜"]) { 
  --main: #9c8c7c !important; --rgb: 156, 140, 124 !important; --motion-color: #b8ab9d !important; 
}

div.custom-nvn-dialogue:is(
  [data-char^="西"], [data-char^="修"], [data-char^="塞"], [data-char^="辛"], 
  [data-char^="萨"], [data-char^="苏"], [data-char^="斯"], [data-char^="索"], 
  [data-char^="森"], [data-char^="瑟"], [data-char^="肖"], [data-char^="夏"], [data-char^="席"]
):not([data-char*="夏洛特"]):not([data-char*="斯提亚拉"]):not([data-char*="斯雅"]):not([data-char*="塞伊"]) {
  --main: #7a9187 !important; --rgb: 122, 145, 135 !important; --motion-color: #9db0a7 !important;
}

div.custom-nvn-dialogue:is(
  [data-char^="艾"], [data-char^="安"], [data-char^="阿"], [data-char^="奥"], 
  [data-char^="亚"], [data-char^="恩"], [data-char^="厄"], [data-char^="尤"], 
  [data-char^="欧"], [data-char^="埃"], [data-char^="爱"], [data-char^="乌"]
):not([data-char*="艾拉"]):not([data-char*="阿黛拉"]):not([data-char*="艾妮希雅"]):not([data-char*="艾尔希"]):not([data-char*="艾珀尔"]) {
  --main: #96899e !important; --rgb: 150, 137, 158 !important; --motion-color: #b5abbd !important;
}

div.custom-nvn-dialogue:is(
  [data-char^="巴"], [data-char^="布"], [data-char^="贝"], [data-char^="博"], 
  [data-char^="宾"], [data-char^="鲍"], 
  [data-char^="伯"], [data-char^="派"], [data-char^="普"], [data-char^="彼"]
):not([data-char*="布娜"]) { 
  --main: #85929e !important; --rgb: 133, 146, 158 !important; --motion-color: #a6b1bc !important; 
}

div.custom-nvn-dialogue:is(
  [data-char^="杰"], [data-char^="吉"], [data-char^="格"], [data-char^="古"], 
  [data-char^="金"], [data-char^="高"], [data-char^="戈"], [data-char^="盖"], 
  [data-char^="加"], [data-char^="贾"], [data-char^="查"], [data-char^="老"], [data-char^="商"]
):not([data-char*="古伊奈"]):not([data-char*="加莉泰娅"]):not([data-char*="盖欧露易丝"]) {
  --main: #9e927c !important; --rgb: 158, 146, 124 !important; --motion-color: #bcb29f !important;
}

div.custom-nvn-dialogue:is(
  [data-char^="雷"], [data-char^="莱"], [data-char^="鲁"], [data-char^="伦"], 
  [data-char^="里"], [data-char^="洛"], [data-char^="兰"], [data-char^="利"], 
  [data-char^="卢"], [data-char^="卫"], [data-char^="兵"], [data-char^="骑"], [data-char^="警"]
):not([data-char*="卢克蕾齐雅"]):not([data-char*="雷克西斯"]):not([data-char*="利奥"]) {
  --main: #7a8b9e !important; --rgb: 122, 139, 158 !important; --motion-color: #9caab9 !important;
}

div.custom-nvn-dialogue:is(
  [data-char^="观"], [data-char^="赫"], [data-char^="哈"], [data-char^="霍"], 
  [data-char^="汉"], [data-char^="海"], 
  [data-char^="费"], [data-char^="弗"], [data-char^="福"], [data-char^="法"]
):not([data-char*="法妮雅"]) {
  --main: #9e8585 !important; --rgb: 158, 133, 133 !important; --motion-color: #bda6a6 !important;
}

div.custom-nvn-dialogue:is(
  [data-char^="卡"], [data-char^="科"], [data-char^="康"], [data-char^="库"], 
  [data-char^="肯"], [data-char^="柯"], [data-char^="客"], [data-char^="店"], 
  [data-char^="路"], [data-char^="男"], [data-char^="市"], [data-char^="村"]
):not([data-char*="卡伊埃尔"]):not([data-char*="卡莲"]):not([data-char*="柯萝特"]) {
  --main: #7c918f !important; --rgb: 124, 145, 143 !important; --motion-color: #9eb1af !important;
}

/* =========================================================================
 * 🌈 所有角色专属色彩定义
 * ========================================================================= */
div.custom-nvn-dialogue[data-char*="克蕾雅"] { --main: #e6b85c !important; --sub: #ffe89e !important; --rgb: 230, 184, 92 !important; --motion-color: #dfc698 !important; }
div.custom-nvn-dialogue:is([data-char*="莉莉娅"], [data-char*="莉莉娅"]) { --main: #d0dbe5 !important; --sub: #ffffff !important; --rgb: 208, 219, 229 !important; --motion-color: #d6e2ed !important; }
div.custom-nvn-dialogue:is([data-char*="梅拉"], [data-char*="梅拉妮"]) { --main: #8c899c !important; --sub: #b8b6c8 !important; --rgb: 140, 137, 156 !important; --motion-color: #b3b0c4 !important; }
div.custom-nvn-dialogue[data-char*="艾拉"] { --main: #c084fc !important; --sub: #ebd5ff !important; --rgb: 192, 132, 252 !important; --motion-color: #d9b3ff !important; }
div.custom-nvn-dialogue:is([data-char*="拉姆"], [data-char*="拉姆内"]) { --main: #ff6584 !important; --sub: #fecdd3 !important; --rgb: 255, 101, 132 !important; --motion-color: #fbaec0 !important; }
div.custom-nvn-dialogue[data-char*="阿黛拉"] { --main: #b8845f !important; --sub: #dec3ab !important; --rgb: 184, 132, 95 !important; --motion-color: #cda282 !important; }
div.custom-nvn-dialogue[data-char*="伊莉丝"] { --main: #a8b8cc !important; --sub: #dce5f0 !important; --rgb: 168, 184, 204 !important; --motion-color: #c3d2e3 !important; }
div.custom-nvn-dialogue[data-char*="丽塔"] { --main: #e04b4b !important; --sub: #fca5a5 !important; --rgb: 224, 75, 75 !important; --motion-color: #f87171 !important; }
div.custom-nvn-dialogue:is([data-char*="菲娅娜"], [data-char*="菲娅"]) { --main: #8e7cc3 !important; --sub: #c9bbf0 !important; --rgb: 142, 124, 195 !important; --motion-color: #b4a7d6 !important; }
div.custom-nvn-dialogue:is([data-char*="凯埃尔"], [data-char*="卡伊埃尔"]) { --main: #9bb0c9 !important; --sub: #c5d4e6 !important; --rgb: 155, 176, 201 !important; --motion-color: #b5c7db !important; }
div.custom-nvn-dialogue[data-char*="露娜"] { --main: #7e7391 !important; --sub: #a89dbb !important; --rgb: 126, 115, 145 !important; --motion-color: #aba1bd !important; }
div.custom-nvn-dialogue[data-char*="桑尼"] { --main: #ff789e !important; --sub: #ffb3c7 !important; --rgb: 255, 120, 158 !important; --motion-color: #ff9cb7 !important; }
div.custom-nvn-dialogue[data-char*="萨菲亚"] { --main: #4a9ff5 !important; --sub: #96c8fb !important; --rgb: 74, 159, 245 !important; --motion-color: #7bb8f7 !important; }
div.custom-nvn-dialogue[data-char*="夏洛特"]:not([data-char*="驱魔"]) { --main: #9e6b47 !important; --sub: #d4a882 !important; --rgb: 158, 107, 71 !important; --motion-color: #c49a78 !important; }
div.custom-nvn-dialogue[data-char*="驱魔夏洛特"] { --main: #c9a227 !important; --sub: #f0dca0 !important; --rgb: 201, 162, 39 !important; --motion-color: #dcc36a !important; }
div.custom-nvn-dialogue[data-char*="法妮雅"] { --main: #5bc0be !important; --sub: #a8e6e4 !important; --rgb: 91, 192, 190 !important; --motion-color: #7fd4d2 !important; }
div.custom-nvn-dialogue[data-char*="响木天音"] { --main: #4a9eb8 !important; --sub: #9fd4e4 !important; --rgb: 74, 158, 184 !important; --motion-color: #6bb8d4 !important; }
div.custom-nvn-dialogue[data-char*="芙洛蒂"] { --main: #7ab87a !important; --sub: #b8e0b8 !important; --rgb: 122, 184, 122 !important; --motion-color: #98ce98 !important; }
div.custom-nvn-dialogue[data-char*="艾妮希雅"] { --main: #e8a8c0 !important; --sub: #f8d0dc !important; --rgb: 232, 168, 192 !important; --motion-color: #f0c0d0 !important; }
div.custom-nvn-dialogue[data-char*="凯拉涅斯"] { --main: #a88cd8 !important; --sub: #d4c0f0 !important; --rgb: 168, 140, 216 !important; --motion-color: #c4aae8 !important; }
div.custom-nvn-dialogue[data-char*="小忆"] { --main: #eef2f8 !important; --sub: #ffffff !important; --rgb: 238, 242, 248 !important; --motion-color: #d8e0ea !important; }
div.custom-nvn-dialogue[data-char*="斯雅"] { --main: #5f4b8b !important; --sub: #a08cc8 !important; --rgb: 95, 75, 139 !important; --motion-color: #8574b0 !important; }
div.custom-nvn-dialogue[data-char*="蒂莎"] { --main: #52b788 !important; --sub: #b7e4c7 !important; --rgb: 82, 183, 136 !important; --motion-color: #74c69d !important; }
div.custom-nvn-dialogue[data-char*="奇诺米"] { --main: #f28482 !important; --sub: #fcd5ce !important; --rgb: 242, 132, 130 !important; --motion-color: #f5a6a5 !important; }
div.custom-nvn-dialogue[data-char*="帕特里琪娅"] { --main: #ff4242 !important; --sub: #ff9999 !important; --rgb: 255, 66, 66 !important; --motion-color: #fca5a5 !important; }
div.custom-nvn-dialogue[data-char*="加莉泰娅"] { --main: #a6b1e1 !important; --sub: #dcd6f7 !important; --rgb: 166, 177, 225 !important; --motion-color: #bac4ec !important; }
div.custom-nvn-dialogue[data-char*="雷克西斯"] { --main: #6ba4b8 !important; --sub: #bfe3ec !important; --rgb: 107, 164, 184 !important; --motion-color: #92bfcf !important; }
div.custom-nvn-dialogue:is([data-char*="盖欧露易丝"], [data-char*="露易丝"]) { --main: #e56b6f !important; --sub: #fbc3bc !important; --rgb: 229, 107, 111 !important; --motion-color: #ea8c8f !important; }
div.custom-nvn-dialogue:is([data-char*="斯提亚拉"], [data-char*="提亚拉"]) { --main: #38a3a5 !important; --sub: #80ed99 !important; --rgb: 56, 163, 165 !important; --motion-color: #57cc99 !important; }
div.custom-nvn-dialogue[data-char*="古伊奈"] { --main: #e9a03b !important; --sub: #fbd686 !important; --rgb: 233, 160, 59 !important; --motion-color: #f1b764 !important; }
div.custom-nvn-dialogue[data-char*="小春"] { --main: #f39c12 !important; --sub: #fdebd0 !important; --rgb: 243, 156, 18 !important; --motion-color: #f8c471 !important; }
div.custom-nvn-dialogue[data-char*="五月雨"] { --main: #5dade2 !important; --sub: #ebf5fb !important; --rgb: 93, 173, 226 !important; --motion-color: #85c1e9 !important; }
div.custom-nvn-dialogue[data-char*="大王"] { --main: #922b21 !important; --sub: #f2d7d5 !important; --rgb: 146, 43, 33 !important; --motion-color: #c0392b !important; }

/* 🌟 本次新增角色色彩定义 */
div.custom-nvn-dialogue[data-char*="艾尔希"]:not([data-char*="IV"]) { --main: #68a0e8 !important; --sub: #cfe3fc !important; --rgb: 104, 160, 232 !important; --motion-color: #8cbcf5 !important; }
div.custom-nvn-dialogue[data-char*="艾尔希IV"] { --main: #4a8ee0 !important; --sub: #b8d9fb !important; --rgb: 74, 142, 224 !important; --motion-color: #72abf0 !important; }
div.custom-nvn-dialogue[data-char*="狄娜"] { --main: #ea6982 !important; --sub: #fbc3bc !important; --rgb: 234, 105, 130 !important; --motion-color: #f2849e !important; }
div.custom-nvn-dialogue[data-char*="卡莲"] { --main: #f1b01c !important; --sub: #fee39f !important; --rgb: 241, 176, 28 !important; --motion-color: #f8c857 !important; }
div.custom-nvn-dialogue[data-char*="柯萝特"] { --main: #8d5b38 !important; --sub: #cca68d !important; --rgb: 141, 91, 56 !important; --motion-color: #b5815d !important; }
div.custom-nvn-dialogue[data-char*="幽妮娅"] { --main: #845ec2 !important; --sub: #d5c6e8 !important; --rgb: 132, 94, 194 !important; --motion-color: #a17fe0 !important; }
div.custom-nvn-dialogue[data-char*="芙萝"] { --main: #48a999 !important; --sub: #a0e0d6 !important; --rgb: 72, 169, 153 !important; --motion-color: #6ec5b6 !important; }
div.custom-nvn-dialogue[data-char*="艾珀尔"] { --main: #d97736 !important; --sub: #fed7aa !important; --rgb: 217, 119, 54 !important; --motion-color: #ea9965 !important; }
div.custom-nvn-dialogue[data-char*="芙洛瑞丝"] { --main: #c779d0 !important; --sub: #f3d3f7 !important; --rgb: 199, 121, 208 !important; --motion-color: #da9fe1 !important; }
div.custom-nvn-dialogue[data-char*="布娜"] { --main: #a27b5c !important; --sub: #ddc5b0 !important; --rgb: 162, 123, 92 !important; --motion-color: #c19d80 !important; }
div.custom-nvn-dialogue[data-char*="塞伊"] { --main: #578ca9 !important; --sub: #b0d3e8 !important; --rgb: 87, 140, 169 !important; --motion-color: #7aaec9 !important; }
div.custom-nvn-dialogue[data-char*="利奥"] { --main: #b3541e !important; --sub: #f7b28d !important; --rgb: 179, 84, 30 !important; --motion-color: #d67943 !important; }
/* 托莉娜（白金色）、魔化托莉娜（纯银冷色）、一之濑雫（淡紫色） */
div.custom-nvn-dialogue[data-char*="托莉娜"]:not([data-char*="魔化"]) { --main: #e2c077 !important; --sub: #fbf5e6 !important; --rgb: 226, 192, 119 !important; --motion-color: #ebd39c !important; }
div.custom-nvn-dialogue[data-char*="魔化托莉娜"] { --main: #aebacd !important; --sub: #eef2f7 !important; --rgb: 174, 186, 205 !important; --motion-color: #c4d0df !important; }
div.custom-nvn-dialogue:is([data-char*="一之濑雫"], ) { --main: #b49bef !important; --sub: #f1ebfc !important; --rgb: 180, 155, 239 !important; --motion-color: #cbbaee !important; }
/* =========================================================================
 * 🌟 新增 Black Souls 体系角色专属色彩（四个爱丽丝防撞色微调）
 * ========================================================================= */
/* 0. 兜底保障：只要含有“爱丽丝”均先赋予纯澈月光白金 */
div.custom-nvn-dialogue[data-char*="爱丽丝"] { 
  --main: #f2d680 !important; 
  --sub: #fffdf5 !important; 
  --rgb: 242, 214, 128 !important; 
  --motion-color: #fae7a8 !important; 
}

/* 1. 女儿爱丽丝：初曦纯澈浅金 */
div.custom-nvn-dialogue:is([data-char*="女儿爱丽丝"], [data-char*="女儿"], [data-char*="爱丽丝（女"], [data-char*="爱丽丝(女"]) { 
  --main: #fae188 !important; 
  --sub: #fffee8 !important; 
  --rgb: 250, 225, 136 !important; 
  --motion-color: #fcf0ba !important; 
}

/* 2. 妈妈/母亲爱丽丝：柔霜香槟白金 */
div.custom-nvn-dialogue:is([data-char*="母亲爱丽丝"], [data-char*="妈妈爱丽丝"], [data-char*="妈妈"], [data-char*="母亲"]) { 
  --main: #e8d39b !important; 
  --sub: #fbf7ee !important; 
  --rgb: 232, 211, 155 !important; 
  --motion-color: #f2e4bf !important; 
}

/* 3. 妹妹爱丽丝：微粉晨曦柔金 */
div.custom-nvn-dialogue:is([data-char*="妹妹爱丽丝"], [data-char*="妹妹"]) { 
  --main: #eed19c !important; 
  --sub: #fdf8ee !important; 
  --rgb: 238, 209, 156 !important; 
  --motion-color: #f5e2bf !important; 
}

/* 4. 爱丽丝·利德尔：纯澈月光白金 */
div.custom-nvn-dialogue:is([data-char*="爱丽丝·利德尔"], [data-char*="利德尔次女"]) { 
  --main: #f2d680 !important; 
  --sub: #fffdf5 !important; 
  --rgb: 242, 214, 128 !important; 
  --motion-color: #fae7a8 !important; 
}

/* 5. 人偶爱丽丝：冷雾银白金 */
div.custom-nvn-dialogue:is([data-char*="人偶爱丽丝"], [data-char*="02-D"]) { 
  --main: #dcd3be !important; 
  --sub: #f6f3eb !important; 
  --rgb: 220, 211, 190 !important; 
  --motion-color: #eae5d7 !important; 
}
div.custom-nvn-dialogue[data-char*="蛇神"] { --main: #d4af37 !important; --sub: #f9f4de !important; --rgb: 212, 175, 55 !important; --motion-color: #e0c567 !important; }
div.custom-nvn-dialogue[data-char*="诺登"] { --main: #d3d7de !important; --sub: #f5f7fa !important; --rgb: 211, 215, 222 !important; --motion-color: #e0e4eb !important; }
div.custom-nvn-dialogue[data-char*="小红帽"] { --main: #d63031 !important; --sub: #fadbd8 !important; --rgb: 214, 48, 49 !important; --motion-color: #e15f60 !important; }
div.custom-nvn-dialogue[data-char*="普利凯特"] { --main: #f08080 !important; --sub: #fde8e8 !important; --rgb: 240, 128, 128 !important; --motion-color: #f4a2a2 !important; }
div.custom-nvn-dialogue[data-char*="梅贝尔"] { --main: #6c5ce7 !important; --sub: #e8e5fb !important; --rgb: 108, 92, 231 !important; --motion-color: #9285ed !important; }
div.custom-nvn-dialogue:is([data-char*="玛丽·安"], [data-char*="莉耶芙"]) { --main: #2ed573 !important; --sub: #e0f9ec !important; --rgb: 46, 213, 115 !important; --motion-color: #65e199 !important; }
div.custom-nvn-dialogue[data-char*="柴郡猫"] { --main: #c39bd3 !important; --sub: #f5eef8 !important; --rgb: 195, 155, 211 !important; --motion-color: #d4b4e0 !important; }
div.custom-nvn-dialogue[data-char*="公爵夫人"] { --main: #e67e22 !important; --sub: #fdf2e9 !important; --rgb: 230, 126, 34 !important; --motion-color: #f0a35e !important; }
div.custom-nvn-dialogue[data-char*="帽子屋"] { --main: #7f8c8d !important; --sub: #f2f4f4 !important; --rgb: 127, 140, 141 !important; --motion-color: #a4afb0 !important; }
div.custom-nvn-dialogue[data-char*="三月兔"] { --main: #e84393 !important; --sub: #fde8f2 !important; --rgb: 232, 67, 147 !important; --motion-color: #ee72ae !important; }
div.custom-nvn-dialogue[data-char*="格里菲"] { --main: #e59866 !important; --sub: #fbf0e8 !important; --rgb: 229, 152, 102 !important; --motion-color: #ebb692 !important; }
div.custom-nvn-dialogue[data-char*="假海龟"] { --main: #48c9b0 !important; --sub: #e8f8f5 !important; --rgb: 72, 201, 176 !important; --motion-color: #79d8c4 !important; }
div.custom-nvn-dialogue[data-char*="渡渡"] { --main: #bcaaa4 !important; --sub: #f5f2f1 !important; --rgb: 188, 170, 164 !important; --motion-color: #d0c2bd !important; }
div.custom-nvn-dialogue[data-char*="希夏"] { --main: #a3cb38 !important; --sub: #f4f9e8 !important; --rgb: 163, 203, 56 !important; --motion-color: #bfdc6f !important; }
div.custom-nvn-dialogue[data-char*="比尔"] { --main: #829f82 !important; --sub: #edf2ed !important; --rgb: 130, 159, 130 !important; --motion-color: #a4bda4 !important; }
div.custom-nvn-dialogue[data-char*="维多利雅"] { --main: #f78fb3 !important; --sub: #fef0f4 !important; --rgb: 247, 143, 179 !important; --motion-color: #f9abc4 !important; }
div.custom-nvn-dialogue[data-char*="弗洛伦斯"] { --main: #34495e !important; --sub: #ebedef !important; --rgb: 52, 73, 94 !important; --motion-color: #61778c !important; }
div.custom-nvn-dialogue[data-char*="罗丽娜"] { --main: #2c3e50 !important; --sub: #d0d7de !important; --rgb: 44, 62, 80 !important; --motion-color: #5d6d7e !important; }
div.custom-nvn-dialogue[data-char*="格尔达"] { --main: #d5dbdb !important; --sub: #f8f9f9 !important; --rgb: 213, 219, 219 !important; --motion-color: #e3e8e8 !important; }
div.custom-nvn-dialogue[data-char*="尤妮丝"] { --main: #dcdde1 !important; --sub: #ffffff !important; --rgb: 220, 221, 225 !important; --motion-color: #ececec !important; }
div.custom-nvn-dialogue[data-char*="莱登"] { --main: #bdc3c7 !important; --sub: #f4f6f7 !important; --rgb: 189, 195, 199 !important; --motion-color: #d2d7d9 !important; }
div.custom-nvn-dialogue[data-char*="克缇"] { --main: #74b9ff !important; --sub: #eaf3fe !important; --rgb: 116, 185, 255 !important; --motion-color: #9eccff !important; }
div.custom-nvn-dialogue[data-char*="贾巴沃克"] { --main: #57606f !important; --sub: #e2e4e7 !important; --rgb: 87, 96, 111 !important; --motion-color: #7d8694 !important; }
div.custom-nvn-dialogue[data-char*="贾布加布"] { --main: #718093 !important; --sub: #e8ecf1 !important; --rgb: 113, 128, 147 !important; --motion-color: #929eaec !important; }
div.custom-nvn-dialogue[data-char*="班达斯奈奇"] { --main: #8854d0 !important; --sub: #efe8fa !important; --rgb: 136, 84, 208 !important; --motion-color: #a77ee0 !important; }
div.custom-nvn-dialogue[data-char*="希伏契"] { --main: #d980fa !important; --sub: #faedf7 !important; --rgb: 217, 128, 250 !important; --motion-color: #e3a2fb !important; }
div.custom-nvn-dialogue[data-char*="崔德尔·蒂"] { --main: #95a5a6 !important; --sub: #eff2f2 !important; --rgb: 149, 165, 166 !important; --motion-color: #b3c0c1 !important; }
div.custom-nvn-dialogue[data-char*="崔德尔·达姆"] { --main: #7f8c8d !important; --sub: #eff1f1 !important; --rgb: 127, 140, 141 !important; --motion-color: #a4afb0 !important; }
div.custom-nvn-dialogue[data-char*="雏鸟"] { --main: #f5cd79 !important; --sub: #fef7e9 !important; --rgb: 245, 205, 121 !important; --motion-color: #f8dba0 !important; }

/* =========================================================================
 * 🖼️ 新增角色头像直链映射（含同义词绑定与共用图）
 * ========================================================================= */
div.custom-nvn-dialogue[data-char*="爱丽丝·利德尔"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/08/fb26cbb7d5caf2b3e5bb006a54de0875c04384eb7c62cad1.png") !important; }
div.custom-nvn-dialogue:is([data-char*="母亲爱丽丝"], [data-char*="妈妈爱丽丝"]) .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/08/097e2ebda0c4b078383c2b19c4920bde1cc4125f756ef6aa.png") !important; }
div.custom-nvn-dialogue:is([data-char*="女儿爱丽丝"], [data-char*="女儿"]) .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/08/89da196c1fb9669196f2ad9a6a09ec2abf29e85dad0da0fb.png") !important; }
div.custom-nvn-dialogue[data-char*="妹妹爱丽丝"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/08/3c41af5f604c2bb1ed68f6662853c44b4f8dc8105575bad6.png") !important; }
div.custom-nvn-dialogue[data-char*="人偶爱丽丝"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/08/02-D14585590e6b7f795.png") !important; }
div.custom-nvn-dialogue[data-char*="蛇神"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/08/3bbc05b5fd9c50bfb6aedabd8561913e6dc51bf2e531d8b4.png") !important; }
div.custom-nvn-dialogue[data-char*="诺登"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/08/77f0ce219f648a571427e5714d58240e54bdb2d9dc32d2e5.png") !important; }
div.custom-nvn-dialogue[data-char*="小红帽"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/08/1c4eb4a13f11a987104f66f37bd94d8546f22fe9308e15e5.png") !important; }
div.custom-nvn-dialogue[data-char*="普利凯特"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/08/ca56c10823d6dfc4a27c94ba4ea9c4511cc8a6f6aee686b3.png") !important; }
div.custom-nvn-dialogue[data-char*="梅贝尔"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/08/27f90d0f6f0497d00bb1ceaf8115284e1b66c644216537c3.png") !important; }
div.custom-nvn-dialogue:is([data-char*="玛丽·安"], [data-char*="莉耶芙"]) .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/08/68208d56a291c30f7e89bc8a5fa6fd13e1aed1c696238752.png") !important; }
div.custom-nvn-dialogue[data-char*="公爵夫人"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/08/1216129b006b0afd1bf774045f3a143ed3455d4fb36660c9.png") !important; }
div.custom-nvn-dialogue[data-char*="帽子屋"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/08/1ba5573147239aa7c55e7cbb16c7ca25e371d8726a04a2d4.png") !important; }
div.custom-nvn-dialogue[data-char*="三月兔"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/08/791905c560e833185bf5c86d2893563cdf5f75d6f095945b.png") !important; }
div.custom-nvn-dialogue[data-char*="格里菲"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/08/e8d44a1d9f39317ce599d94299e3d4709d247b246f960cc2.png") !important; }
div.custom-nvn-dialogue[data-char*="假海龟"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/08/efc9a1ed037ff82ca2cae7188a1ed873e0d8eaa07203b795.png") !important; }
div.custom-nvn-dialogue[data-char*="渡渡"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/08/01c652f6295aa9d879b6edc78d15a1bc3a07d8a19355fe81.png") !important; }
div.custom-nvn-dialogue[data-char*="希夏"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/08/bc529f3bf9e2cc322fae41d8f235a6e038b0d5ffecc7d679.png") !important; }
div.custom-nvn-dialogue[data-char*="比尔"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/08/0444efc5eee28f540afbf6192ae23264dbf5299a7b84d651.png") !important; }
div.custom-nvn-dialogue[data-char*="维多利雅"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/08/c27572a47de3e01fb4a5455d537b355543c4223c9185e464.png") !important; }
div.custom-nvn-dialogue[data-char*="弗洛伦斯"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/08/547364de2221410a5d2c60f321a4b3c0e390f8fd861e5ad3.png") !important; }
div.custom-nvn-dialogue[data-char*="罗丽娜"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/08/b997d7fef52e6eee76c4425bc3c78faf0a4b42391dc02b30.png") !important; }
div.custom-nvn-dialogue[data-char*="格尔达"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/08/3ac5fe98a76ed9b7f07baae999747a86d28860c6dbc6fffd.png") !important; }
div.custom-nvn-dialogue[data-char*="尤妮丝"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/08/ff8a0b04f4731b352285cd8c0ba4269ef74975a52f838548.png") !important; }
div.custom-nvn-dialogue[data-char*="莱登"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/08/38a4e9c4e0eb78bc673b4181afe01519ef722fc246ed5d7f.png") !important; }
div.custom-nvn-dialogue[data-char*="克缇"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/08/ff1ee1b191655fb8c9aa04f6d09f76a9f62bddd5931366d9.png") !important; }
div.custom-nvn-dialogue[data-char*="贾巴沃克"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/08/b56e15e3dcdeb6d688ba47bd419fd6a8fc438b7af1e6396e.png") !important; }
div.custom-nvn-dialogue[data-char*="贾布加布"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/08/a46701cee939312d7f011f77864237383716913e0874e75e.png") !important; }
div.custom-nvn-dialogue[data-char*="班达斯奈奇"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/08/d366140eb2de17f66eabdfa7b8989a126df38d4017c34ae9.png") !important; }
div.custom-nvn-dialogue[data-char*="希伏契"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/08/a6adcbd2dbec8fc9de3e6da4f4e5d708994c0f743539c7c1.png") !important; }
div.custom-nvn-dialogue[data-char*="柴郡猫"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/08/10b332bf0cf41232d9ede85ed4d0993927a335b40acf9b6b.png") !important; }
div.custom-nvn-dialogue[data-char*="崔德尔·蒂"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/08/1c4970974e4d8539449cd885faa450aff250a6732dc135dc.png") !important; }
div.custom-nvn-dialogue[data-char*="崔德尔·达姆"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/08/184a570189a0a08fbaaf3869debd0ab87efbb67d0ad87da4.png") !important; }
div.custom-nvn-dialogue[data-char*="雏鸟"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/08/bcd2a8cd2f373febdf12a9bf714a74b0f4a1b4bda6becd1c.png") !important; }
/* 单图角色 */
div.custom-nvn-dialogue:is([data-char*="凯埃尔"], [data-char*="卡伊埃尔"]) .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/02667b3c75d750d735ccf39b458b59e44df3c52454f35dd9.png") !important; }
div.custom-nvn-dialogue[data-char*="露娜"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/22706d19f51532c81.png") !important; }
div.custom-nvn-dialogue[data-char*="桑尼"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/a1053a15a247fce3f550d7bded6046c67cc23cbe47716f0a.png") !important; }
div.custom-nvn-dialogue[data-char*="萨菲亚"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/1e71ebd4a7e3712ee09e6eab8cbc9cd2eeb8e7dfed68f836.png") !important; }
[data-char*="菲娅"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/19/8bd536a22ff04e798acce03d2331ef5d4a6c08d85dccef06.png") !important; }
div.custom-nvn-dialogue[data-char*="拉菲莉娅"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/eb8b2e9da49acde3a0c1317b0955027b23ebb331418be102.png") !important; }
div.custom-nvn-dialogue[data-char*="赛蕾姆丝"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/6d5ab923b636763c7398d33755ccaeb6b57a6fa8d0dd10c7.png") !important; }
div.custom-nvn-dialogue[data-char*="斯雅"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/26/4d26a6b4ad5b72c59bdbfc9acf8b79988691d20c23dcfea7.png") !important; }
div.custom-nvn-dialogue[data-char*="雷克西斯"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/80e258a6d9acd96271df8fe07bb10f678e01d1827dada321.png") !important; }
div.custom-nvn-dialogue[data-char*="小春"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/9c29c6d29af5d31e6b48e46ed1cffad77a6c029ca66ed4e9.png") !important; }
div.custom-nvn-dialogue[data-char*="五月雨"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/73accf3be7605e89f3761656f72183e225fe340d23ced5b5.png") !important; }
div.custom-nvn-dialogue[data-char*="大王"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/70613f9cd926eb9df8dc022f17ca61912aeb9c2553cd6916.png") !important; }
div.custom-nvn-dialogue[data-char*="芙萝"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/d42bc6bfe30dc9fba9f0bb3b72b0d96430c5e4eda1959dd9.png") !important; }
div.custom-nvn-dialogue[data-char*="艾珀尔"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/678582aa9b9eaa9a413b09fad59bf58ace7ed9acb8bc71e5.png") !important; }
div.custom-nvn-dialogue[data-char*="芙洛瑞丝"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/98a89e9e1c99d3180fc2145b6d31506fea73cc00947be8c7.png") !important; }
div.custom-nvn-dialogue[data-char*="布娜"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/b92aa349890498ace7f37b15df6a7b0617cbd18ed4d9ffdc.png") !important; }
div.custom-nvn-dialogue[data-char*="幽妮娅"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/a98c931c39917d2e6805d548362ec83e0416053184ba36d5.png") !important; }
div.custom-nvn-dialogue[data-char*="塞伊"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/8e62b282f44ee645991192a03528683c5ffe336fdd2a15e7.png") !important; }
div.custom-nvn-dialogue[data-char*="利奥"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/629723423085ca2f84dec0fb44b157ec7246078acec59370.png") !important; }

/* =========================================================================
 * 🎭 表情差分映射完整配置
 * ========================================================================= */
/* --- 克蕾雅 --- */
[data-char*="克蕾雅"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/1409d4e13ab7c1ad7e96924a36bdd9a3482303ab0ef221c1.png") !important; }
[data-char*="克蕾雅"][data-action*="脸红"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/fc2183f6475eb6ee573dd4db16b3ec9f48c2cb75b49e78e4.png") !important; }
[data-char*="克蕾雅"][data-action="通常"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/1409d4e13ab7c1ad7e96924a36bdd9a3482303ab0ef221c1.png") !important; }
[data-char*="克蕾雅"][data-action="脸红通常"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/fc2183f6475eb6ee573dd4db16b3ec9f48c2cb75b49e78e4.png") !important; }
[data-char*="克蕾雅"][data-action="得意"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/1f27d649bd5f1a9ddb35bfefea4ed3f04683fd73356f1699.png") !important; }
[data-char*="克蕾雅"][data-action="脸红得意"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/bc29db1fa53036376ad890acbf993fda57275798edb08f16.png") !important; }
[data-char*="克蕾雅"][data-action="腹黑笑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/5f4e05c1af887f84f81b6389692ef9af103738822016d420.png") !important; }
[data-char*="克蕾雅"][data-action="脸红腹黑笑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/2d53ef3ea50d7e218f439e2fac5683be6c93ddb9aacfbb81.png") !important; }
[data-char*="克蕾雅"][data-action="害羞"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/68033e2d6a21b8051c9508ff0755bddbed247c407040b4bb.png") !important; }
[data-char*="克蕾雅"][data-action="惊讶"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/7794ef980f5bc34e787a3995b6b0b4b7745084898eb659ed.png") !important; }
[data-char*="克蕾雅"][data-action="脸红惊讶"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/baa11b8602a9f6449cf68eed348d25580c136419c3adba4f.png") !important; }
[data-char*="克蕾雅"][data-action="高兴"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/d8a041121401ef923bac3be73db4bf7b0d8a40a14a7ca628.png") !important; }
[data-char*="克蕾雅"][data-action="脸红高兴"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/57581a2f8d7520b05fc6b4faac3a7d06100aa17811a87dd5.png") !important; }
[data-char*="克蕾雅"][data-action="难过"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/f65ef8265d29273d9253d211fc1e1e1fb7179c9a6778d8b2.png") !important; }
[data-char*="克蕾雅"][data-action="脸红难过"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/3befe4267924d76dbc662ecae1807ed7f63377ed996d0970.png") !important; }
[data-char*="克蕾雅"][data-action="疑惑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/b0b4fdd77f7292caf2f58b6edff0f66b237500ffb5fb3610.png") !important; }
[data-char*="克蕾雅"][data-action="脸红疑惑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/f03cbb5d81bb016bac835a74dfd51176f02cbb804c65fe98.png") !important; }
[data-char*="克蕾雅"][data-action="生气"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/3b2308cdc7cf17a9cbdcc5e19940c31ec7d54698b268f4f5.png") !important; }
[data-char*="克蕾雅"][data-action="脸红生气"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/44ce1289e408ff31326c15854d2dd52400d534ac1dcbd11f.png") !important; }
[data-char*="克蕾雅"][data-action="皱眉"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/2a1abab328580412da62f64cc99df487554518f75d7f6560.png") !important; }
[data-char*="克蕾雅"][data-action="脸红皱眉"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/c1f238456163127c71dad05c1ff273da1cf2136d8b8580ee.png") !important; }
[data-char*="克蕾雅"][data-action="思考"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/d0e17c88434483f1d7a56d38338f6d23aea4606b985fee04.png") !important; }
[data-char*="克蕾雅"][data-action="脸红思考"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/c9a1f8b8fc602d1a851b83c15311e7b05e5f33868d44dde8.png") !important; }

/* --- 伊莉丝 --- */
[data-char*="伊莉丝"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/19/2d1f3a9410fb102694138c3814c6eea58e488a9222034f2f.png") !important; }
[data-char*="伊莉丝"][data-action*="脸红"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/19/4689bd9b3deca1a625816f59a28a6ffa733ef33534f9c072.png") !important; }
[data-char*="伊莉丝"][data-action="通常"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/19/34615f5ddf9e4653b.png") !important; }
[data-char*="伊莉丝"][data-action="脸红通常"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/19/35c2596b5b45e7c2e.png") !important; }
[data-char*="伊莉丝"][data-action="得意"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/19/bf1e5e544b378ff2803074f4b48ca40c02cc02bf6f2931f1.png") !important; }
[data-char*="伊莉丝"][data-action="脸红得意"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/19/1301eb18fd535af029aa49ddf78d6ae98dec947fa655c20f.png") !important; }
[data-char*="伊莉丝"][data-action="腹黑笑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/19/07e978464cc11b95b74679c3d8f4fb49945af2d2f3833cb0.png") !important; }
[data-char*="伊莉丝"][data-action="脸红腹黑笑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/19/a0b7dd4135fee73211b096c4f9070d3f15829f334e3078f5.png") !important; }
[data-char*="伊莉丝"][data-action="害羞"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/19/e50b93e9f8d79e3c5eafe22fe628864448f956ba1782eb2e.png") !important; }
[data-char*="伊莉丝"][data-action="惊讶"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/19/bd06e19e9c2ef9eb9339a66cdef14edc45a6c214456bd89c.png") !important; }
[data-char*="伊莉丝"][data-action="脸红惊讶"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/19/15f4cf6e1d512b52af3e568ab1a666c2b7fbac8b6f730d85.png") !important; }
[data-char*="伊莉丝"][data-action="高兴"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/19/4bd0ed4b90feb9392fcbe3ae9f9c811fb9014bfc1bd6448b.png") !important; }
[data-char*="伊莉丝"][data-action="脸红高兴"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/19/5cb1c6594c9ff9a88671c706b8209bf10cbfcf21be29210d.png") !important; }
[data-char*="伊莉丝"][data-action="难过"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/19/7fa8e7d4d2304a6c0caf6ed4b54151c4a1953c266fe98029.png") !important; }
[data-char*="伊莉丝"][data-action="脸红难过"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/19/bad5379dd4f6693a19ae015491a7038c210b5d18ea400440.png") !important; }
[data-char*="伊莉丝"][data-action="疑惑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/19/288f8338059e8b87bb25309c732e1a1198ad3cfe3d8c3fa6.png") !important; }
[data-char*="伊莉丝"][data-action="脸红疑惑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/19/8ce72aa99400e79a2213a21b1e998e304d09accb1466081f.png") !important; }
[data-char*="伊莉丝"][data-action="生气"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/19/81523adb94e0e465337e9d8f972f5d858e6dbb6f0e8e6ff0.png") !important; }
[data-char*="伊莉丝"][data-action="脸红生气"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/19/9bd4d9a1afdd75612e8bbf13988dc542f9f18a2a42c2e651.png") !important; }
[data-char*="伊莉丝"][data-action="皱眉"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/19/8e3ee4cc4ab643bc29d5a6da695f8b487dae91bc28e8af96.png") !important; }
[data-char*="伊莉丝"][data-action="脸红皱眉"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/19/fd3a8c132004572e04a300524b489866393e9f8995f567de.png") !important; }
[data-char*="伊莉丝"][data-action="思考"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/19/54bca66d23f55859a3b59f732941cbcb56ed53e6a76a7ed7.png") !important; }
[data-char*="伊莉丝"][data-action="脸红思考"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/19/e88187549e11bef5b0eb6893605d51d49d5349ecfb821311.png") !important; }

/* --- 丽塔 --- */
[data-char*="丽塔"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/19/47add4de39d9d3d7f8aeee6228c46f8453aa07b8239428b3.png") !important; }
[data-char*="丽塔"][data-action*="脸红"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/19/6d033264a424686c6a2b5338bfd17fbda4bb18cd74ba0691.png") !important; }
[data-char*="丽塔"][data-action="通常"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/19/47add4de39d9d3d7f8aeee6228c46f8453aa07b8239428b3.png") !important; }
[data-char*="丽塔"][data-action="脸红通常"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/19/6d033264a424686c6a2b5338bfd17fbda4bb18cd74ba0691.png") !important; }
[data-char*="丽塔"][data-action="得意"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/19/c5fde236c8c7be783ea6450c38b41382edeb6192fa8679c7.png") !important; }
[data-char*="丽塔"][data-action="脸红得意"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/19/5467ae0083cedd3ee6770cd162d7af4826f988b7ae51c073.png") !important; }
[data-char*="丽塔"][data-action="腹黑笑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/19/dfa3289f7fc5fbb2454f0c5662a90ade49ceea085a03b395.png") !important; }
[data-char*="丽塔"][data-action="脸红腹黑笑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/19/d4505e88420bf9a8a429010c990a47e8b9e67d09e855c743.png") !important; }
[data-char*="丽塔"][data-action="害羞"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/19/095bbd75ad7acf33c306be24164dde89068f728baa17d681.png") !important; }
[data-char*="丽塔"][data-action="惊讶"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/19/125c12b59d1dda9887d6b2e75697c81b22152ff82e82eeb5.png") !important; }
[data-char*="丽塔"][data-action="脸红惊讶"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/19/6a478e37757af13f4a0b4477b3af8d2988bcb99651965005.png") !important; }
[data-char*="丽塔"][data-action="高兴"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/19/18cca123f05c53a2f084dc19c6468ef430da4d7fe4c6ac7d.png") !important; }
[data-char*="丽塔"][data-action="脸红高兴"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/19/8de9e1926bd12bcf32cb3eec058b7039c4b9127e1026175e.png") !important; }
[data-char*="丽塔"][data-action="难过"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/19/0ccfa301e20560eb02a9720e5ee967d724bc21039ea569ff.png") !important; }
[data-char*="丽塔"][data-action="脸红难过"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/19/-1777fcbb8f0962a89.png") !important; }
[data-char*="丽塔"][data-action="疑惑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/19/dcf1d5b1f709c5b9bbfafe4c944b2fab345ce755c1de2a70.png") !important; }
[data-char*="丽塔"][data-action="脸红疑惑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/19/4ef60f1e5f6447f16a56e9e68e91ef13e1c25569197c8af7.png") !important; }
[data-char*="丽塔"][data-action="生气"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/19/4e558241b5ccf3b6e1e6a1eacb63095de1df0eb96ca02631.png") !important; }
[data-char*="丽塔"][data-action="脸红生气"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/19/a899ce12c9b53722d1aff1ecfcb5ecccd5f3e46fa3acba84.png") !important; }
[data-char*="丽塔"][data-action="皱眉"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/19/559a06130b8885bb1e68c0add3c40cccf9db00a4df920f10.png") !important; }
[data-char*="丽塔"][data-action="脸红皱眉"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/19/2a6682eaae5f565b288f14f76ca72b55a48c7e911773f49f.png") !important; }
[data-char*="丽塔"][data-action="思考"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/19/f519fa6632f26500c804b94289ba16d13b34533cc9ae5b01.png") !important; }
[data-char*="丽塔"][data-action="脸红思考"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/19/-1dcf99e2b159f9244.png") !important; }

/* --- 阿黛拉 --- */
[data-char*="阿黛拉"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/8960482acfee34f1120a7e040e65b7ba8ea28a72c3e3e1c4.png") !important; }
[data-char*="阿黛拉"][data-action*="脸红"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/665bf599d73b460e42def7abc9a4447ea947cc1da5f83855.png") !important; }
[data-char*="阿黛拉"][data-action="通常"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/8960482acfee34f1120a7e040e65b7ba8ea28a72c3e3e1c4.png") !important; }
[data-char*="阿黛拉"][data-action="脸红通常"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/665bf599d73b460e42def7abc9a4447ea947cc1da5f83855.png") !important; }
[data-char*="阿黛拉"][data-action="得意"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/7f67009dc9a0a4b6a42a4450612b4fca4019a9cce4c515bc.png") !important; }
[data-char*="阿黛拉"][data-action="脸红得意"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/513eb8b2086e68cde091f4aea6f7f66d71b039300e9ed2cd.png") !important; }
[data-char*="阿黛拉"][data-action="腹黑笑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/bc20e6fa0d3b89fe11c5872b9608621dbeea0663f06bd343.png") !important; }
[data-char*="阿黛拉"][data-action="脸红腹黑笑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/786949f552dbc4febc4ba2d852f47e4cd1cb2e26402ea4e2.png") !important; }
[data-char*="阿黛拉"][data-action="害羞"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/5cd500e3d05b215bc0b2444eaf91fbd83d3f67beaf841ae3.png") !important; }
[data-char*="阿黛拉"][data-action="惊讶"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/12e43e66df59e65723e6c343508516930bcd9003e59948e3.png") !important; }
[data-char*="阿黛拉"][data-action="脸红惊讶"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/54beacaf9cb7504ebbd2178fad8ed7a6712f7eed4fba8764.png") !important; }
[data-char*="阿黛拉"][data-action="高兴"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/79fd7c28e4381469b559e36287704b3cd6e47a4bd1bde584.png") !important; }
[data-char*="阿黛拉"][data-action="脸红高兴"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/a90a7d5dd55b22365bf4fa074c97f1148f42a47dc87ae641.png") !important; }
[data-char*="阿黛拉"][data-action="难过"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/cb141b0da54e1c150db0da8a8aff3ac9d1480675c4952b7e.png") !important; }
[data-char*="阿黛拉"][data-action="脸红难过"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/5426bb77aae3fe6e179c94ea81c91abb20d5b1b3520b6c9a.png") !important; }
[data-char*="阿黛拉"][data-action="疑惑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/63d348cae62e7c771b2f77574913b75164b5b0d58bd1a048.png") !important; }
[data-char*="阿黛拉"][data-action="脸红疑惑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/52b07fc182d9be002bb498256fd296e338176dde4cc7959f.png") !important; }
[data-char*="阿黛拉"][data-action="生气"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/fde55a1951c49b181efb5057337a677c5d7ba0d0c83c45cc.png") !important; }
[data-char*="阿黛拉"][data-action="脸红生气"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/21dd76135ae3f43151678f0c79734ee7fc36bbe6cd642fd3.png") !important; }
[data-char*="阿黛拉"][data-action="皱眉"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/9d7862ea27d91e2ab62272841fa47bf7b44a9628681cc6fa.png") !important; }
[data-char*="阿黛拉"][data-action="脸红皱眉"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/a98e1b42aedefe0ff1a5907fb049cf3cb6e03fe95fecee82.png") !important; }
[data-char*="阿黛拉"][data-action="思考"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/c99e8527594d38bd42d10b72528fb2a053ab7b5d24e16b28.png") !important; }
[data-char*="阿黛拉"][data-action="脸红思考"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/5c21f0d6cdc524af194a40f343025388fbf55e0f6aceba73.png") !important; }

/* --- 梅拉 --- */
[data-char*="梅拉"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/31f3ea8ecb0364f11784be1d0e50200bb3a6ea2667f58b02.png") !important; }
[data-char*="梅拉"][data-action*="脸红"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/100159557a2e55589a4fc286ec0dd189ddc7e2534f145055.png") !important; }
[data-char*="梅拉"][data-action="通常"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/31f3ea8ecb0364f11784be1d0e50200bb3a6ea2667f58b02.png") !important; }
[data-char*="梅拉"][data-action="脸红通常"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/100159557a2e55589a4fc286ec0dd189ddc7e2534f145055.png") !important; }
[data-char*="梅拉"][data-action="得意"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/ae395e8eb5a2238089054c807786f6192739b63e6ef1bdff.png") !important; }
[data-char*="梅拉"][data-action="脸红得意"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/738d7831ddb6e76670293caa9a88c6d079679a1fb66eca30.png") !important; }
[data-char*="梅拉"][data-action="腹黑笑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/fa3dfeb86c123ad01d84319586fcafb44c2e2d868a3ba85b.png") !important; }
[data-char*="梅拉"][data-action="脸红腹黑笑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/ea41b6c7f09b8650927147c895b7294a461996d4a2d7de8f.png") !important; }
[data-char*="梅拉"][data-action="害羞"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/4742561e08ebf9cbb99c0795303f3979e7e13b6770b9ba52.png") !important; }
[data-char*="梅拉"][data-action="惊讶"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/c5fd5fa754fc065c2c4d9b67051dc892b72920f072458be2.png") !important; }
[data-char*="梅拉"][data-action="脸红惊讶"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/7fcd9a29eb0fecba48facf9bc470b986175712e05ffcce10.png") !important; }
[data-char*="梅拉"][data-action="高兴"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/96d76ef5ca7645fc29b2691251eaf2a6dbea0a3d73f19c6c.png") !important; }
[data-char*="梅拉"][data-action="脸红高兴"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/b16cd17c94a9368ad3dfb3dac20439aa8f8ce5275fb6fd7d.png") !important; }
[data-char*="梅拉"][data-action="难过"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/9d71829728a30069411798cbe849eba90e9be1e9d12bfe39.png") !important; }
[data-char*="梅拉"][data-action="脸红难过"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/c52a6b3babb88e053e6163da0b0d864bacefb98cc4827b92.png") !important; }
[data-char*="梅拉"][data-action="疑惑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/79e75a569914fd4678426a3a1cb1db1d9afbbfa353eb78be.png") !important; }
[data-char*="梅拉"][data-action="脸红疑惑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/740df39c6a2e9da1e81954472aadb93061d589f2bb0e6b57.png") !important; }
[data-char*="梅拉"][data-action="生气"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/82ec6b22c2555527db97de9baac3de0628ccfc64e53d9d14.png") !important; }
[data-char*="梅拉"][data-action="脸红生气"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/cd6a6a517c9cb2008efbc1f425bac7c2a3019d91f5067592.png") !important; }
[data-char*="梅拉"][data-action="皱眉"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/364add85ce583254de200ce119dcd738068d6aae01a4adc6.png") !important; }
[data-char*="梅拉"][data-action="脸红皱眉"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/e526b5782639d64a5f09843b67a29fd9522b7d962214e7fc.png") !important; }
[data-char*="梅拉"][data-action="思考"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/905f0f40a56760b7f44aadf067bdd6d80b7d061b02ea0741.png") !important; }
[data-char*="梅拉"][data-action="脸红思考"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/6112acdb0158fe22762f891845ae9772793b1ef7067e5252.png") !important; }

/* --- 莉莉 --- */
[data-char*="莉莉娅"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/1b3aaf46fcec72dd5b23d8ecd9092f3b0f41accba6f103d6.png") !important; }
[data-char*="莉莉娅"][data-action*="脸红"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/a7636a238de8d81418337b0d1df2618e301d240b5c61ffbd.png") !important; }
[data-char*="莉莉娅"][data-action="通常"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/1b3aaf46fcec72dd5b23d8ecd9092f3b0f41accba6f103d6.png") !important; }
[data-char*="莉莉娅"][data-action="脸红通常"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/a7636a238de8d81418337b0d1df2618e301d240b5c61ffbd.png") !important; }
[data-char*="莉莉娅"][data-action="得意"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/3138860658141946831e677f2093e7afed7bdfd217c05d9d.png") !important; }
[data-char*="莉莉娅"][data-action="脸红得意"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/e1330533b0b523fb7814683fc0999557c0b1c1e740f3481e.png") !important; }
[data-char*="莉莉娅"][data-action="腹黑笑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/6ce53dc214b98e71f7f256c98b93b9b71151a88f9d182eba.png") !important; }
[data-char*="莉莉娅"][data-action="脸红腹黑笑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/671d28be8f9f3ed6c4f82a25efe9da10f16f6b79785205b9.png") !important; }
[data-char*="莉莉娅"][data-action="害羞"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/c6c396f3a649c77f17cfc46857ba894009c4649cc9f51f2d.png") !important; }
[data-char*="莉莉娅"][data-action="惊讶"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/027dfb0a620e8912c0249e4032090a62c129ae0c1f408888.png") !important; }
[data-char*="莉莉娅"][data-action="脸红惊讶"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/edd003d06bb444976ece5673b7eb43ba1fec1ac47034c75f.png") !important; }
[data-char*="莉莉娅"][data-action="高兴"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/34f60ea0e5516e75e625c681dc525e1431d3a34d880a5a2d.png") !important; }
[data-char*="莉莉娅"][data-action="脸红高兴"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/9facb2467e155cb9541786f9e8e7bc787f1f439e30c1592b.png") !important; }
[data-char*="莉莉娅"][data-action="难过"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/90d700fd5a93c1f12710a3b65ef0966edd3e956f1be1b0b6.png") !important; }
[data-char*="莉莉娅"][data-action="脸红难过"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/27d21c28fb65babfbaf79cf034d9a74af4c73aa1498094ee.png") !important; }
[data-char*="莉莉娅"][data-action="疑惑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/d00661b9329e74d570cf2b98c8cb102dda0334e3541c7660.png") !important; }
[data-char*="莉莉娅"][data-action="脸红疑惑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/e2a1404c93542c47590d06399aa769ae593051cbb9f65f1f.png") !important; }
[data-char*="莉莉娅"][data-action="生气"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/c8969fb6484869e36dc15ba513874e036eb4b8965b51b4e8.png") !important; }
[data-char*="莉莉娅"][data-action="脸红生气"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/c88829e09638eaceb597598307a0a2fc7a95f574932ddb62.png") !important; }
[data-char*="莉莉娅"][data-action="皱眉"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/0c931f76312656a1adba06ef25281d0f76f24750c65b0c3d.png") !important; }
[data-char*="莉莉娅"][data-action="脸红皱眉"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/a015791532749a2e248b9d618ddf3c27e978def1c6f82f01.png") !important; }
[data-char*="莉莉娅"][data-action="思考"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/5c621c2ded57c234081d622e74ed8744a490dae7a5b64e5e.png") !important; }
[data-char*="莉莉娅"][data-action="脸红思考"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/481fa47b90a985960d44d5f21b5b04befa908759c18b60ce.png") !important; }

/* --- 拉姆 --- */
[data-char*="拉姆"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/140a45b97be03162fb8a7e59122a125807d4ba4f42278523.png") !important; }
[data-char*="拉姆"][data-action*="脸红"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/5373f09e5f43e6bfb473ed2951eaaef7422d14b2413c6e03.png") !important; }
[data-char*="拉姆"][data-action="通常"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/140a45b97be03162fb8a7e59122a125807d4ba4f42278523.png") !important; }
[data-char*="拉姆"][data-action="脸红通常"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/5373f09e5f43e6bfb473ed2951eaaef7422d14b2413c6e03.png") !important; }
[data-char*="拉姆"][data-action="得意"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/5a4644d2b95eae96d5a4e0dc1d462189eb01207576b4c697.png") !important; }
[data-char*="拉姆"][data-action="脸红得意"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/0ffd5cf4b3662abfa4856718ed40f856a198f651f88d0c9b.png") !important; }
[data-char*="拉姆"][data-action="腹黑笑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/74f41da98f1b606b10dabf415ad9c5c5d6bb56061e484a80.png") !important; }
[data-char*="拉姆"][data-action="脸红腹黑笑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/f79ea39e185e226dc8d88d6a29e85b6a797828387b74f536.png") !important; }
[data-char*="拉姆"][data-action="害羞"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/a6672c37788e684665c5a666736fb0cbbbf666c937dfa0e6.png") !important; }
[data-char*="拉姆"][data-action="惊讶"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/ff30b934b7d652e4faa60cebe8e7724fad2dc33273fd6242.png") !important; }
[data-char*="拉姆"][data-action="脸红惊讶"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/742102bff8b8c2fea5ca5fd1359fd4ada5752cbbd406f95c.png") !important; }
[data-char*="拉姆"][data-action="高兴"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/e45fc8cf4f6a3ca5f0dc5994eebd07c08e6071b0c3afc3db.png") !important; }
[data-char*="拉姆"][data-action="脸红高兴"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/6971c3fbdb1da74e72900f6411c96a74bcb7fbac340d4a9a.png") !important; }
[data-char*="拉姆"][data-action="难过"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/ff5a6c234bad96b8012708b87770f2edceb98e448ca17d61.png") !important; }
[data-char*="拉姆"][data-action="脸红难过"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/ebba5db55d801c71fd3b8cffd4be48e2776500ecf12c9c2e.png") !important; }
[data-char*="拉姆"][data-action="疑惑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/25b666f1abd61ad6c6b0ce9d25b3deae1c121b60f881fcae.png") !important; }
[data-char*="拉姆"][data-action="脸红疑惑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/8a842bdf35ba9e1cbee5f26467b169c7d39c69bfc3fa6509.png") !important; }
[data-char*="拉姆"][data-action="生气"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/c473be2f0ad52d56f1fba2d5f34352d2e8e90f4630d5823d.png") !important; }
[data-char*="拉姆"][data-action="脸红生气"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/e49e5c775b29b1887319005a21d556efa17187d443e2b908.png") !important; }
[data-char*="拉姆"][data-action="皱眉"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/74f41da98f1b606b10dabf415ad9c5c5d6bb56061e484a80.png") !important; }
[data-char*="拉姆"][data-action="脸红皱眉"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/f79ea39e185e226dc8d88d6a29e85b6a797828387b74f536.png") !important; }
[data-char*="拉姆"][data-action="思考"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/a6c058a724dc806d5b2b8715793bebb00697067776c1169c.png") !important; }
[data-char*="拉姆"][data-action="脸红思考"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/35b3c80b9fc7c03529c4a2ea2751aedd0197b46d8fb5daf4.png") !important; }

/* --- 艾拉 --- */
[data-char*="艾拉"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/bdf825043d9582bba3d3ec9ae02dafad295f3a856a6c53ab.png") !important; }
[data-char*="艾拉"][data-action*="脸红"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/0344fa170ffe85346ae5906940be3ba654135fb78c203a37.png") !important; }
[data-char*="艾拉"][data-action="通常"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/bdf825043d9582bba3d3ec9ae02dafad295f3a856a6c53ab.png") !important; }
[data-char*="艾拉"][data-action="脸红通常"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/0344fa170ffe85346ae5906940be3ba654135fb78c203a37.png") !important; }
[data-char*="艾拉"][data-action="得意"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/24fc0f446921ab87d98f6d9e6ac7de35191c64fae91cbe85.png") !important; }
[data-char*="艾拉"][data-action="脸红得意"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/a784ef3dfbdb87768fc4d879f6165733eb057852c89b449b.png") !important; }
[data-char*="艾拉"][data-action="腹黑笑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/504f111c623dff93a92557b3e6e5ca562ee663bc6436a10a.png") !important; }
[data-char*="艾拉"][data-action="脸红腹黑笑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/4c9988ee89d45667b03a8ca273763a4ed2cc7086f1d56548.png") !important; }
[data-char*="艾拉"][data-action="害羞"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/1a2c3bd276841201fc6f7aa719f76d914e725ae1e06b95ef.png") !important; }
[data-char*="艾拉"][data-action="惊讶"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/7d74469e0fce225d67f0bad63622c1bfc62b56ecd796161f.png") !important; }
[data-char*="艾拉"][data-action="脸红惊讶"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/44367a10dcb2e244c721a29ee9e70b1dfc2e657a5206619c.png") !important; }
[data-char*="艾拉"][data-action="高兴"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/bdf825043d9582bba3d3ec9ae02dafad295f3a856a6c53ab.png") !important; }
[data-char*="艾拉"][data-action="脸红高兴"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/0344fa170ffe85346ae5906940be3ba654135fb78c203a37.png") !important; }
[data-char*="艾拉"][data-action="难过"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/9d052f9a3809a445034c57c1825d82a5b7f6f87532b56adc.png") !important; }
[data-char*="艾拉"][data-action="脸红难过"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/9d052f9a3809a445034c57c1825d82a5b7f6f87532b56adc.png") !important; }
[data-char*="艾拉"][data-action="疑惑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/1985f35b5e3b17bc49a9cf2b98b87975c510bf8fc857f7eb.png") !important; }
[data-char*="艾拉"][data-action="脸红疑惑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/be2969c9dc93769607dc6f6c6cbd96c8610e71c11dc48317.png") !important; }
[data-char*="艾拉"][data-action="生气"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/e112b5d3d27ac1d16ed242795a4764a2e2b967ee5bf52845.png") !important; }
[data-char*="艾拉"][data-action="脸红生气"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/afbd6b61b5506b00e8bdab1efc29ade8c6c273bcf032e1cd.png") !important; }
[data-char*="艾拉"][data-action="皱眉"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/c9fd1e4a71e5f196d8184581007dd03c0dd000250198b74b.png") !important; }
[data-char*="艾拉"][data-action="脸红皱眉"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/f40bcc2ab6041482a2ba9b0c057bc58dfd0265d874ca4983.png") !important; }
[data-char*="艾拉"][data-action="思考"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/b7a7d7cc5c3d35d8f75bf690e393d15408b4fbefb13d11a4.png") !important; }
[data-char*="艾拉"][data-action="脸红思考"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/16/8dc6082603fe2cb9e2479c04388208e6946ed214615d00b3.png") !important; }

/* --- 小忆 --- */
[data-char*="小忆"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/26/f16f5cf001d3d4768eeb47187c358cc39dccf9359928fbd3.png") !important; }
[data-char*="小忆"][data-action*="脸红"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/26/4c9bc2369c704c06f597176c77446471c3cb10384307170a.png") !important; }
[data-char*="小忆"][data-action="害羞"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/26/0e9c2ca512ef6ae75d85d7a0dea0dc6d7ec7fb2fbc3d66bb.png") !important; }
[data-char*="小忆"][data-action="高兴"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/26/a9e12264d4a13b50bc82cae92e5ba3be4438e57180cce9c8.png") !important; }
[data-char*="小忆"][data-action="脸红高兴"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/26/ae9ae048696ab50bed30b90bde72617823584df9f259663b.png") !important; }
[data-char*="小忆"][data-action="难过"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/26/c3518fbefd41a3997dbf144d122a3ae38b3e9944c47096b3.png") !important; }
[data-char*="小忆"][data-action="脸红难过"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/26/f2b09a5e819f649aae6b4ce63e68aea00a5f2edd9915dee3.png") !important; }
[data-char*="小忆"][data-action="疑惑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/26/fa31b5d8dac69b313b2b560a3926348609eb5e9bdf06c1c5.png") !important; }
[data-char*="小忆"][data-action="脸红疑惑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/26/f1cb86329106e2eb4933bf85bd4f590aba12c91312957af4.png") !important; }
[data-char*="小忆"][data-action="生气"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/26/b7588776e4ef5d3729d0d077f9c65f7d1863c7c67f829dce.png") !important; }
[data-char*="小忆"][data-action="脸红生气"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/26/dfbf43577a58bcefbec403bfb265f8cf3b52ecf47ba6c6bf.png") !important; }
[data-char*="小忆"][data-action="皱眉"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/26/6adaf2d99d690d5233ade40e39d49519a69d5e8cde21ff0a.png") !important; }
[data-char*="小忆"][data-action="脸红皱眉"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/26/bfe18b6a1a252d59a4ebb5e68c31ad21ad1562d6d924d9c1.png") !important; }
[data-char*="小忆"][data-action="思考"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/26/76bccccd741753bd6487ba79df2c2f94e4b26506808fca3a.png") !important; }
[data-char*="小忆"][data-action="脸红思考"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/26/70dbb571e49c342453c34f6d85d244f484aeff748cce3377.png") !important; }

/* --- 夏洛特 --- */
[data-char*="夏洛特"]:not([data-char*="驱魔"]) .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/cfd04c9114e4aa6437c8334891a48cc3fdc86ac377d63ceb.png") !important; }
[data-char*="夏洛特"]:not([data-char*="驱魔"])[data-action*="脸红"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/17ede3423819c10acc3fd15529e238ad817d2b8c0a500407.png") !important; }
[data-char*="夏洛特"]:not([data-char*="驱魔"])[data-action="通常"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/cfd04c9114e4aa6437c8334891a48cc3fdc86ac377d63ceb.png") !important; }
[data-char*="夏洛特"]:not([data-char*="驱魔"])[data-action="脸红通常"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/17ede3423819c10acc3fd15529e238ad817d2b8c0a500407.png") !important; }
[data-char*="夏洛特"]:not([data-char*="驱魔"])[data-action="得意"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/cfd04c9114e4aa6437c8334891a48cc3fdc86ac377d63ceb.png") !important; }
[data-char*="夏洛特"]:not([data-char*="驱魔"])[data-action="脸红得意"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/17ede3423819c10acc3fd15529e238ad817d2b8c0a500407.png") !important; }
[data-char*="夏洛特"]:not([data-char*="驱魔"])[data-action="腹黑笑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/0633dfad6369bd7ebb2d49c69cd14fdb8a341311ae7b8685.png") !important; }
[data-char*="夏洛特"]:not([data-char*="驱魔"])[data-action="脸红腹黑笑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/28125c96576b7cd3003c25555e95dfdd4f0215ec201efb15.png") !important; }
[data-char*="夏洛特"]:not([data-char*="驱魔"])[data-action="害羞"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/fd78c6de36e9fde85d236aadcb64efba6d97e3ce96d68f69.png") !important; }
[data-char*="夏洛特"]:not([data-char*="驱魔"])[data-action="惊讶"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/2f1ae844d9da7a93d1d32c786c888d2724eb614cc80f0b1f.png") !important; }
[data-char*="夏洛特"]:not([data-char*="驱魔"])[data-action="脸红惊讶"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/b44a44dc9ac484206bec4fab835b44e0cedda2fc3d621e97.png") !important; }
[data-char*="夏洛特"]:not([data-char*="驱魔"])[data-action="高兴"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/cfd04c9114e4aa6437c8334891a48cc3fdc86ac377d63ceb.png") !important; }
[data-char*="夏洛特"]:not([data-char*="驱魔"])[data-action="脸红高兴"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/17ede3423819c10acc3fd15529e238ad817d2b8c0a500407.png") !important; }
[data-char*="夏洛特"]:not([data-char*="驱魔"])[data-action="难过"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/373cff69eca7df93ab10bd528cfb8a2e6a315563ac7a13f3.png") !important; }
[data-char*="夏洛特"]:not([data-char*="驱魔"])[data-action="脸红难过"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/354b52acc079944c74d6353abdb5cdc89a77c5860a7612f6.png") !important; }
[data-char*="夏洛特"]:not([data-char*="驱魔"])[data-action="疑惑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/132bfcc5488ed6bb5e761f89b9e61b713c69908487ad115b.png") !important; }
[data-char*="夏洛特"]:not([data-char*="驱魔"])[data-action="脸红疑惑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/5fa0f99a68e7f1cd90b01f272eaa8a1d797b18346bcf33c6.png") !important; }
[data-char*="夏洛特"]:not([data-char*="驱魔"])[data-action="生气"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/1a3c35464e826bb8b6d22fe69fb1e26b72522e3c667cf430.png") !important; }
[data-char*="夏洛特"]:not([data-char*="驱魔"])[data-action="脸红生气"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/3ab045acdbc69d14e587bab597976917d1bd8b2b09646cc7.png") !important; }
[data-char*="夏洛特"]:not([data-char*="驱魔"])[data-action="皱眉"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/5b94ab6af14d77bb506c6239a578e86668143ce047e1748d.png") !important; }
[data-char*="夏洛特"]:not([data-char*="驱魔"])[data-action="脸红皱眉"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/b742e73b95fbd63448557cce8719fcd8ed4d274dc4d8af9e.png") !important; }
[data-char*="夏洛特"]:not([data-char*="驱魔"])[data-action="思考"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/5b94ab6af14d77bb506c6239a578e86668143ce047e1748d.png") !important; }
[data-char*="夏洛特"]:not([data-char*="驱魔"])[data-action="脸红思考"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/b742e73b95fbd63448557cce8719fcd8ed4d274dc4d8af9e.png") !important; }

/* --- 驱魔夏洛特 --- */
[data-char*="驱魔夏洛特"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/0d6698fda3e658892f161b80cd5bb3d425023db57b3a592c.png") !important; }
[data-char*="驱魔夏洛特"][data-action*="脸红"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/5744cb0fd20d8d0298003a8776a227d0ec271693ec8b44bc.png") !important; }
[data-char*="驱魔夏洛特"][data-action="通常"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/0d6698fda3e658892f161b80cd5bb3d425023db57b3a592c.png") !important; }
[data-char*="驱魔夏洛特"][data-action="脸红通常"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/5744cb0fd20d8d0298003a8776a227d0ec271693ec8b44bc.png") !important; }
[data-char*="驱魔夏洛特"][data-action="得意"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/0d6698fda3e658892f161b80cd5bb3d425023db57b3a592c.png") !important; }
[data-char*="驱魔夏洛特"][data-action="脸红得意"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/5744cb0fd20d8d0298003a8776a227d0ec271693ec8b44bc.png") !important; }
[data-char*="驱魔夏洛特"][data-action="腹黑笑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/aa7bb572fd58d7883dbd9db365fb1c998512926feb792042.png") !important; }
[data-char*="驱魔夏洛特"][data-action="脸红腹黑笑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/57716fe6c3d7a991bfc5e0c6f98b8c798732832bc7c78d5f.png") !important; }
[data-char*="驱魔夏洛特"][data-action="害羞"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/3a4a41420a26d1fa03f2458843530d5ceea7f0f6d2e8636d.png") !important; }
[data-char*="驱魔夏洛特"][data-action="惊讶"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/60938571c8109541e0cd6c552a3aa9794a0ad76e3ad3dd22.png") !important; }
[data-char*="驱魔夏洛特"][data-action="脸红惊讶"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/e3522067f6aef9d9ea3dfdc3903e1ed7038519c82a2df285.png") !important; }
[data-char*="驱魔夏洛特"][data-action="高兴"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/0d6698fda3e658892f161b80cd5bb3d425023db57b3a592c.png") !important; }
[data-char*="驱魔夏洛特"][data-action="脸红高兴"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/5744cb0fd20d8d0298003a8776a227d0ec271693ec8b44bc.png") !important; }
[data-char*="驱魔夏洛特"][data-action="难过"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/004fc1902408c91eedb3659171da1a636cd3593bb4c248a6.png") !important; }
[data-char*="驱魔夏洛特"][data-action="脸红难过"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/a8d725ee82b375d200ccf00a08e6c85bb71a5be942ea53ef.png") !important; }
[data-char*="驱魔夏洛特"][data-action="疑惑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/5be9012b86e986273ea08f1d5040c3e3eeab0a1dd134823a.png") !important; }
[data-char*="驱魔夏洛特"][data-action="脸红疑惑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/e389dd83b248bcc689a95fef9e22b80041710f689e7c152b.png") !important; }
[data-char*="驱魔夏洛特"][data-action="生气"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/1cfb52f27da7571867af74aeb8aef421a7548824e97fb741.png") !important; }
[data-char*="驱魔夏洛特"][data-action="脸红生气"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/83e7d9d6afdda9e71be8f9d491be73a2f248f1b661d5058e.png") !important; }
[data-char*="驱魔夏洛特"][data-action="皱眉"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/444c7a13e195cd3bb09dff1fde76888cb085ebc94d92ff28.png") !important; }
[data-char*="驱魔夏洛特"][data-action="脸红皱眉"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/af0eac513a0dbe694e7b22197fff769be8a72123bb46e722.png") !important; }
[data-char*="驱魔夏洛特"][data-action="思考"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/444c7a13e195cd3bb09dff1fde76888cb085ebc94d92ff28.png") !important; }
[data-char*="驱魔夏洛特"][data-action="脸红思考"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/af0eac513a0dbe694e7b22197fff769be8a72123bb46e722.png") !important; }

/* --- 法妮雅 --- */
[data-char*="法妮雅"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/a8ee953f071a831f7a0d909307d81494fb18f557364cbaaf.png") !important; }
[data-char*="法妮雅"][data-action*="脸红"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/dc26ab56d73b923c48f535bc9fd6c124ecd2d2222acfb324.png") !important; }
[data-char*="法妮雅"][data-action="通常"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/a8ee953f071a831f7a0d909307d81494fb18f557364cbaaf.png") !important; }
[data-char*="法妮雅"][data-action="脸红通常"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/dc26ab56d73b923c48f535bc9fd6c124ecd2d2222acfb324.png") !important; }
[data-char*="法妮雅"][data-action="得意"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/a6f9e367e553f9c0deba22923d477f1b82f1c8bd3307f2f2.png") !important; }
[data-char*="法妮雅"][data-action="脸红得意"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/3d2bbebbdf9de5447bb8b39c49b6b974f94f971f16399262.png") !important; }
[data-char*="法妮雅"][data-action="腹黑笑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/b1ba188b486bac6aa6a4ef870d7fabb3206532753eb0d3a6.png") !important; }
[data-char*="法妮雅"][data-action="脸红腹黑笑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/5638dc7fa7e98a5ad3d1fa8e830d5154846b8721276d436d.png") !important; }
[data-char*="法妮雅"][data-action="害羞"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/0a988e5127900aceeffdd65956d01b9b363626f4e6629b92.png") !important; }
[data-char*="法妮雅"][data-action="惊讶"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/8ef2321547b240b15140aa25496283ada16b41450020c854.png") !important; }
[data-char*="法妮雅"][data-action="脸红惊讶"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/6ce15e5ebe4ec90d196951b86cb4de2a62ad5c86f558938c.png") !important; }
[data-char*="法妮雅"][data-action="高兴"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/a8ee953f071a831f7a0d909307d81494fb18f557364cbaaf.png") !important; }
[data-char*="法妮雅"][data-action="脸红高兴"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/dc26ab56d73b923c48f535bc9fd6c124ecd2d2222acfb324.png") !important; }
[data-char*="法妮雅"][data-action="难过"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/bbd3f1032708104e02112594c1ef1969c3d79dcd44029d61.png") !important; }
[data-char*="法妮雅"][data-action="脸红难过"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/3447f4adc37ca9212b5d31b5bf1f9b770fac15e329dfdb75.png") !important; }
[data-char*="法妮雅"][data-action="疑惑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/b76c0122153ea152309e51544573c343fccbe89aadcbd94e.png") !important; }
[data-char*="法妮雅"][data-action="脸红疑惑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/83b292585b5633860ef565ab7fe54d86fe6833d41624c909.png") !important; }
[data-char*="法妮雅"][data-action="生气"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/0bc3f46764dae45f7fd0899f3f5904ba5d8a8ad12737f4c3.png") !important; }
[data-char*="法妮雅"][data-action="脸红生气"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/44f5455476055a28a4e7faeed379122f45954a04b68970fd.png") !important; }
[data-char*="法妮雅"][data-action="皱眉"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/dc271f941fe0a1ff61d886e593c1ddb127296d869e7c25a5.png") !important; }
[data-char*="法妮雅"][data-action="脸红皱眉"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/7179a93ec4c569cf05964f435b39ff4d393088436c39bf3a.png") !important; }
[data-char*="法妮雅"][data-action="思考"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/342100af6b594719b0584a256c732687de552852d6bff1be.png") !important; }
[data-char*="法妮雅"][data-action="脸红思考"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/a922129cb7b2390ebf7000808da5ce0b2844e8a5cb1a52bf.png") !important; }

/* --- 响木天音 --- */
[data-char*="响木天音"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/37006260238a0b0548b3bfa0782220d3008ccef9e096d764.png") !important; }
[data-char*="响木天音"][data-action*="脸红"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/968070cc0a5bd6b6e22d784bc9be757e4b2cc7969ceeba79.png") !important; }
[data-char*="响木天音"][data-action="通常"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/37006260238a0b0548b3bfa0782220d3008ccef9e096d764.png") !important; }
[data-char*="响木天音"][data-action="脸红通常"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/968070cc0a5bd6b6e22d784bc9be757e4b2cc7969ceeba79.png") !important; }
[data-char*="响木天音"][data-action="得意"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/0c088a148fdce3a11b949aa6d436c12304d09da36592a70b.png") !important; }
[data-char*="响木天音"][data-action="脸红得意"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/3eb50c308eb325690a5e683320c6cacbb23ad59fd4e1874d.png") !important; }
[data-char*="响木天音"][data-action="腹黑笑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/82a58aeda1132dd753f5990bceb88900c96553876630142a.png") !important; }
[data-char*="响木天音"][data-action="脸红腹黑笑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/90468c182f3b34a7681b524837a581001eb31c102fecf2c1.png") !important; }
[data-char*="响木天音"][data-action="害羞"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/87733037a0e1dd3511c1ad8405821fb773c5312b5ad2d468.png") !important; }
[data-char*="响木天音"][data-action="惊讶"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/135f583300e3e1fd347f129101a2a09c9d0588e478cf74c0.png") !important; }
[data-char*="响木天音"][data-action="脸红惊讶"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/8da52a5cf5bf7af54dafc3e2bd043803fec00cefd8026053.png") !important; }
[data-char*="响木天音"][data-action="高兴"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/37006260238a0b0548b3bfa0782220d3008ccef9e096d764.png") !important; }
[data-char*="响木天音"][data-action="脸红高兴"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/968070cc0a5bd6b6e22d784bc9be757e4b2cc7969ceeba79.png") !important; }
[data-char*="响木天音"][data-action="难过"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/1214a0073dbb188fb3d19deda0cd9188d48df7e88e9eff21.png") !important; }
[data-char*="响木天音"][data-action="脸红难过"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/eb43a141cc901e3b42b622c9d02d6cfb05436fd9320e7478.png") !important; }
[data-char*="响木天音"][data-action="疑惑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/ef2b985077313d67a72e80b7bc4884c65d62f3cd7d567fce.png") !important; }
[data-char*="响木天音"][data-action="脸红疑惑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/b2b4e5550fb91cef8df986d31e6bf6cdfe94949fb7b3ae9a.png") !important; }
[data-char*="响木天音"][data-action="生气"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/1e263de38c1a66edfc7a60b198893afecbd383209ae202ee.png") !important; }
[data-char*="响木天音"][data-action="脸红生气"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/60896d68b0961f6af5a81fb19f84c18279fcccbd44e19514.png") !important; }
[data-char*="响木天音"][data-action="皱眉"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/0bf34a77adf11c44c1e3be74231034052070184bf3c77f15.png") !important; }
[data-char*="响木天音"][data-action="脸红皱眉"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/c794a80179e3029e8a688c6b9443a3c14d57899752731a82.png") !important; }
[data-char*="响木天音"][data-action="思考"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/0dc4d3e6244ca8b2eeb7b6a3a189cf0aedf333753e51bbb3.png") !important; }
[data-char*="响木天音"][data-action="脸红思考"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/01b3b8b9654a36204022ffcc526cbf5c2eebe37a3eab8b86.png") !important; }

/* --- 芙洛蒂 --- */
[data-char*="芙洛蒂"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/4dc6200820290c3f0850b1ef48e107eec138f9223373b60b.png") !important; }
[data-char*="芙洛蒂"][data-action*="脸红"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/761251f598385cb4e84e7fe9b2808ac1a5c77c489d88c204.png") !important; }
[data-char*="芙洛蒂"][data-action="通常"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/4dc6200820290c3f0850b1ef48e107eec138f9223373b60b.png") !important; }
[data-char*="芙洛蒂"][data-action="脸红通常"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/761251f598385cb4e84e7fe9b2808ac1a5c77c489d88c204.png") !important; }
[data-char*="芙洛蒂"][data-action="得意"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/1910e7ec8bdda4644196e5feefc1a40462384bc404e16824.png") !important; }
[data-char*="芙洛蒂"][data-action="脸红得意"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/b64cdbd574d7d1f366ad232fad12ec618397129c794f7000.png") !important; }
[data-char*="芙洛蒂"][data-action="腹黑笑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/215d8f840735c8401.png") !important; }
[data-char*="芙洛蒂"][data-action="脸红腹黑笑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/cc1ce4fb0d6e9e419e220d077e6ccc89b1aeeda9d0be80fe.png") !important; }
[data-char*="芙洛蒂"][data-action="害羞"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/5c9d2c61658d0f7f8c0e08fda71019bd6bff1295d78fa54f.png") !important; }
[data-char*="芙洛蒂"][data-action="惊讶"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/b58bdeea3de83de2611f8bcdca60f884064c63bb37f77520.png") !important; }
[data-char*="芙洛蒂"][data-action="脸红惊讶"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/b5f254484e7d070c2d6559f5643ed5a2bc186e8497cbfc0f.png") !important; }
[data-char*="芙洛蒂"][data-action="高兴"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/7741a580e299ef7088a3b3e29327116d3cdd8d6fcb336740.png") !important; }
[data-char*="芙洛蒂"][data-action="脸红高兴"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/c31db8d99fbb5d8b7f499eb23ce59b13167106c147a369fb.png") !important; }
[data-char*="芙洛蒂"][data-action="难过"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/bc41c7df1dd5b50c73483d1285105099adfd72854182d590.png") !important; }
[data-char*="芙洛蒂"][data-action="脸红难过"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/6bbb778b59f1f1f3f25c12cad956d0c6bd33b52159b31148.png") !important; }
[data-char*="芙洛蒂"][data-action="疑惑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/ad6a0dc6bb7aa62657ab7162c72108d22fcb1d1fde365fdb.png") !important; }
[data-char*="芙洛蒂"][data-action="脸红疑惑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/a4f299e44dec334cd34c35e2a3d233efe7e4fc35f6db3c1f.png") !important; }
[data-char*="芙洛蒂"][data-action="生气"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/5fb5bb2009c95735e16badf596359f34b3ea18964e250e0f.png") !important; }
[data-char*="芙洛蒂"][data-action="脸红生气"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/4450f12ccf1bbefff87a08d4d8da723db2b3a4987db21d6d.png") !important; }
[data-char*="芙洛蒂"][data-action="皱眉"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/72b570130c16fcbaa244cb0285a402c75b744cd7bf331f09.png") !important; }
[data-char*="芙洛蒂"][data-action="脸红皱眉"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/a66b9f2b67462e51a1874a44f541de23cbeee88fb7f1538f.png") !important; }
[data-char*="芙洛蒂"][data-action="思考"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/72b570130c16fcbaa244cb0285a402c75b744cd7bf331f09.png") !important; }
[data-char*="芙洛蒂"][data-action="脸红思考"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/a66b9f2b67462e51a1874a44f541de23cbeee88fb7f1538f.png") !important; }

/* --- 艾妮希雅 --- */
[data-char*="艾妮希雅"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/35c2aa1a16d684964cdc8c58bc8438ff4dc4733308eeb8a0.png") !important; }
[data-char*="艾妮希雅"][data-action*="脸红"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/eaa159fc8f0f59a4ee2cc572eeb1d1d09e8234a1f85b1bf1.png") !important; }
[data-char*="艾妮希雅"][data-action="通常"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/35c2aa1a16d684964cdc8c58bc8438ff4dc4733308eeb8a0.png") !important; }
[data-char*="艾妮希雅"][data-action="脸红通常"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/eaa159fc8f0f59a4ee2cc572eeb1d1d09e8234a1f85b1bf1.png") !important; }
[data-char*="艾妮希雅"][data-action="得意"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/eddaaaeeca442b8090a9e14c55c3105695e53325b70a3cbc.png") !important; }
[data-char*="艾妮希雅"][data-action="脸红得意"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/853777cf7453780928899de29abb9865a5b16fe637c4e296.png") !important; }
[data-char*="艾妮希雅"][data-action="腹黑笑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/ccb160dd526efa67f4e809c599df73746b98ee5983a6da0d.png") !important; }
[data-char*="艾妮希雅"][data-action="脸红腹黑笑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/4c6b6d14051b5459c3c8c16abf8c07f5049cf033b4fc6ee8.png") !important; }
[data-char*="艾妮希雅"][data-action="害羞"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/eaa159fc8f0f59a4ee2cc572eeb1d1d09e8234a1f85b1bf1.png") !important; }
[data-char*="艾妮希雅"][data-action="惊讶"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/09c6472e21e9107ca96dc93c8847e2dbb7f22f47426c67f3.png") !important; }
[data-char*="艾妮希雅"][data-action="脸红惊讶"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/1daa34af17fd0af1ede733b3a4bd1d6706aca34122fa6f8a.png") !important; }
[data-char*="艾妮希雅"][data-action="高兴"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/35c2aa1a16d684964cdc8c58bc8438ff4dc4733308eeb8a0.png") !important; }
[data-char*="艾妮希雅"][data-action="脸红高兴"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/eaa159fc8f0f59a4ee2cc572eeb1d1d09e8234a1f85b1bf1.png") !important; }
[data-char*="艾妮希雅"][data-action="难过"] .custom-nvn-avatar-img {background-image: url("https://origin.picgo.net/2026/09/25/a898b5787c34fec0cb1af743ca7e0b06d3821cc3e4a5e6cd.png") !important; }
[data-char*="艾妮希雅"][data-action="脸红难过"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/9027755c75bb255d05f6e73c297954bd9a488dfd1ca8a4c2.png") !important; }
[data-char*="艾妮希雅"][data-action="疑惑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/6480296779018092160bb17450f0befca3d61c9fbec30c04.png") !important; }
[data-char*="艾妮希雅"][data-action="脸红疑惑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/1517344b0c847000b3abb9b2aea6420422d025b7a354bdac.png") !important; }
[data-char*="艾妮希雅"][data-action="生气"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/54c8671fd93eae33bd8e3804eac3368192e7dec5b164140f.png") !important; }
[data-char*="艾妮希雅"][data-action="脸红生气"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/24f127fa3191ec70e1a5af45dd27e221a1a4edd547bfacc0.png") !important; }
[data-char*="艾妮希雅"][data-action="皱眉"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/3ac7a2dc3a6a32b01f1b1ac5306a90bb351d05207f10a733.png") !important; }
[data-char*="艾妮希雅"][data-action="脸红皱眉"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/309405ac25144be46da740218c043cd7653e82b2b75a1293.png") !important; }
[data-char*="艾妮希雅"][data-action="思考"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/e53024c7ae4441a4ab69bec6c004986baa400acd5c70c929.png") !important; }
[data-char*="艾妮希雅"][data-action="脸红思考"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/2bd7932b70435189d4a816eb2b515d72d5e9e85f3ace7e91.png") !important; }

/* --- 凯拉涅斯 --- */
[data-char*="凯拉涅斯"][data-action="通常"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/bb4a5ed33708e06d417eda8ddb0e91f68e74b80f51d10325.png") !important; }
[data-char*="凯拉涅斯"][data-action="脸红通常"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/19d361065316c419fa1787454076912c04ec50b9190306b6.png") !important; }
[data-char*="凯拉涅斯"][data-action="得意"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/b0b5767671323c47ba97584d8c0035b2b0f93e598d8a0ec0.png") !important; }
[data-char*="凯拉涅斯"][data-action="脸红得意"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/05da5bd0cb6b39cb132ec3069862cfe95e0b44ed3449d9b3.png") !important; }
[data-char*="凯拉涅斯"][data-action="腹黑笑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/163d2c78c25d5b4f464fa6bc85cc115df7d63b47c3dbb8f9.png") !important; }
[data-char*="凯拉涅斯"][data-action="脸红腹黑笑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/ec2e4e57713017f183b42f2c095f40b8cc682018530dfc9c.png") !important; }
[data-char*="凯拉涅斯"][data-action="害羞"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/73100106dbfc51ee7beba1c2260cb578ea2867e6d149cfa5.png") !important; }
[data-char*="凯拉涅斯"][data-action="惊讶"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/2ed552023696372e810c8033eb4a93654f1ed2b367dd8c73.png") !important; }
[data-char*="凯拉涅斯"][data-action="脸红惊讶"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/e164a5f586a5ca64a691fb6e76e2b7ac9ce94f11b75c20d7.png") !important; }
[data-char*="凯拉涅斯"][data-action="高兴"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/edc8201290d49d3af77a6312f5ca81dffc2411d8b342c690.png") !important; }
[data-char*="凯拉涅斯"][data-action="脸红高兴"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/c3d318659e617484a26625eee271a1632accf51f4dd57d3d.png") !important; }
[data-char*="凯拉涅斯"][data-action="难过"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/93ad095e0e00821f61089a5394e08a4ee9e673a6be10e5e0.png") !important; }
[data-char*="凯拉涅斯"][data-action="脸红难过"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/5bd3a69ec637821daee29b5e3a29a7fc35aec146b2b2a5d4.png") !important; }
[data-char*="凯拉涅斯"][data-action="疑惑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/07c49ba596c6eb45bf18ffa7d8041a4443db4d49166364f9.png") !important; }
[data-char*="凯拉涅斯"][data-action="脸红疑惑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/08550fd10026d5832eb9e05d11b499e038172d5f289baf73.png") !important; }
[data-char*="凯拉涅斯"][data-action="生气"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/6f5a3860a9161a0a6dd32f373aea514c853b0ac4e240c735.png") !important; }
[data-char*="凯拉涅斯"][data-action="脸红生气"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/cbd91e58992bb3d62185471f4eb7e06c1a5ff1024bff89f3.png") !important; }
[data-char*="凯拉涅斯"][data-action="皱眉"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/dfa8435988bf21544143f812d0f01a7a97976f338a6ba802.png") !important; }
[data-char*="凯拉涅斯"][data-action="脸红皱眉"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/144dd01b446f9648ae84ba1f0e2418c4b969708fa8368280.png") !important; }
[data-char*="凯拉涅斯"][data-action="思考"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/d873746a739c257fb0dfab9dd3d89d5200208686987d4920.png") !important; }
[data-char*="凯拉涅斯"][data-action="脸红思考"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/25/736b4be84862d4d4c79be5a367799865931e0be86be66250.png") !important; }

/* --- 蒂莎 --- */
[data-char*="蒂莎"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/dddf9f7b026a25a6fe59bfc6e7d6bdfcd3801f07834c4e22.png") !important; }
[data-char*="蒂莎"][data-action*="脸红"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/cd4f84f4e5f2a228a0c81018163d47cab6cef34994c54e1b.png") !important; }
[data-char*="蒂莎"][data-action="通常"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/dddf9f7b026a25a6fe59bfc6e7d6bdfcd3801f07834c4e22.png") !important; }
[data-char*="蒂莎"][data-action="脸红通常"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/cd4f84f4e5f2a228a0c81018163d47cab6cef34994c54e1b.png") !important; }
[data-char*="蒂莎"][data-action="害羞"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/cd4f84f4e5f2a228a0c81018163d47cab6cef34994c54e1b.png") !important; }
[data-char*="蒂莎"][data-action="惊讶"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/37b1b7f000be329044faaa949a9774ac3b091066508db442.png") !important; }
[data-char*="蒂莎"][data-action="脸红惊讶"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/b425b9aa123ab85ab24dcdbeda474768f164bdcf41d5d039.png") !important; }
[data-char*="蒂莎"][data-action="高兴"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/37c4840847a24f26c2248d81e92a871c5891420c37de0b0d.png") !important; }
[data-char*="蒂莎"][data-action="脸红高兴"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/02f9164b5c8fc50d3249d1319c62bcfb7d6816cae8560e79.png") !important; }
[data-char*="蒂莎"][data-action="难过"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/d7248b7247dac3161914dca68efc4b3c5a169f78798f6f77.png") !important; }
[data-char*="蒂莎"][data-action="脸红难过"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/45d4f037e30145936d5426decd3f3f69f4e41c4cefc9dd4e.png") !important; }
[data-char*="蒂莎"][data-action="疑惑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/d6b44be4b1d598f50b7f90e4dd66435f35aa9c4da76eaacc.png") !important; }
[data-char*="蒂莎"][data-action="脸红疑惑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/9cfc11e1246f77c87edc23a6990132ebe187df874ea3fd2b.png") !important; }
[data-char*="蒂莎"][data-action="生气"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/1488c7a6d47fe18a5939ef9ba0f5da3965b7edfdd78bac47.png") !important; }
[data-char*="蒂莎"][data-action="脸红生气"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/333a34d86f98aa691af93096dd41cee21ae13b8aa89972e3.png") !important; }
[data-char*="蒂莎"][data-action="皱眉"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/76beac97f01431eed7e760648123ea9e21957cc3846a73eb.png") !important; }
[data-char*="蒂莎"][data-action="脸红皱眉"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/b8b6f0ac801dae9590eab81d4466978c9892b39f0918cfa4.png") !important; }

/* --- 奇诺米 --- */
[data-char*="奇诺米"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/0c120bef0861efca8485e86c94aea4917f2ecc31a8c236b7.png") !important; }
[data-char*="奇诺米"][data-action*="脸红"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/8b676a49771da051452bb60b8f420d9b1d71616e69d46ab9.png") !important; }
[data-char*="奇诺米"][data-action="通常"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/0c120bef0861efca8485e86c94aea4917f2ecc31a8c236b7.png") !important; }
[data-char*="奇诺米"][data-action="脸红通常"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/8b676a49771da051452bb60b8f420d9b1d71616e69d46ab9.png") !important; }
[data-char*="奇诺米"][data-action="得意"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/2e4b33da6b638e943da01b73593600a654e427c8789e4959.png") !important; }
[data-char*="奇诺米"][data-action="脸红得意"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/f550a9f293cd4f2d4091ea1d5c9ab587ca7a9d5ce6f28648.png") !important; }
[data-char*="奇诺米"][data-action="害羞"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/8b676a49771da051452bb60b8f420d9b1d71616e69d46ab9.png") !important; }
[data-char*="奇诺米"][data-action="惊讶"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/6c8c027a2c39baff29af49f32a7f3d2851970c62119a894d.png") !important; }
[data-char*="奇诺米"][data-action="脸红惊讶"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/4fae0681a8c525f525f432e8058b9c48ef8f757e440c7563.png") !important; }
[data-char*="奇诺米"][data-action="高兴"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/cc5d79be4b9fd9bdd15c04a2f61d2288137f9b809e25e2f3.png") !important; }
[data-char*="奇诺米"][data-action="脸红高兴"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/7e4cc79239b72fec311f2190527573c204c9e8008a9cce65.png") !important; }
[data-char*="奇诺米"][data-action="难过"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/565c50f840b40076517da5e5f70ae52e8d4ed3fc073313cf.png") !important; }
[data-char*="奇诺米"][data-action="脸红难过"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/981327d0151df178dedbd4197ae2175da8dd341034559405.png") !important; }
[data-char*="奇诺米"][data-action="疑惑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/ce0f9b4b3d3b31f312cc92c80524f86e533a4d3bdac0aa17.png") !important; }
[data-char*="奇诺米"][data-action="脸红疑惑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/597ca0191f1c0fd043b252aa86d778212a6e39347aef34a7.png") !important; }
[data-char*="奇诺米"][data-action="生气"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/176801e6a262b5da09e0ed99b58394af84528e0348bb6ebf.png") !important; }
[data-char*="奇诺米"][data-action="脸红生气"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/051cae49a0cecb1a6ab619a71709efddbe24b2bba8761b5b.png") !important; }

/* --- 帕特里琪娅 --- */
[data-char*="帕特里琪娅"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/fbe5e0bbc4983a9368ddb8721d7589280f23e9bc35f9a04d.png") !important; }
[data-char*="帕特里琪娅"][data-action*="脸红"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/8826fe1f6e741e9972396b6550475f944e4b07703b16ff01.png") !important; }
[data-char*="帕特里琪娅"][data-action="通常"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/fbe5e0bbc4983a9368ddb8721d7589280f23e9bc35f9a04d.png") !important; }
[data-char*="帕特里琪娅"][data-action="脸红通常"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/8826fe1f6e741e9972396b6550475f944e4b07703b16ff01.png") !important; }
[data-char*="帕特里琪娅"][data-action="得意"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/9ec93fbad0ac21f6eb6c9e77cd3b91a9c33ee38f454e5fa6.png") !important; }
[data-char*="帕特里琪娅"][data-action="脸红得意"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/83878b90695bb027b66562a931bfe634f92e3030b461bb6c.png") !important; }
[data-char*="帕特里琪娅"][data-action="害羞"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/8826fe1f6e741e9972396b6550475f944e4b07703b16ff01.png") !important; }
[data-char*="帕特里琪娅"][data-action="惊讶"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/83d664e91224723628283c154f135500ba44932bececdbf0.png") !important; }
[data-char*="帕特里琪娅"][data-action="脸红惊讶"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/c67cd9f403a15269d7275670ee9127760b6d1bad542386a4.png") !important; }
[data-char*="帕特里琪娅"][data-action="高兴"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/6e2abcfec6f0cb51cca7298829a0376853ee7c7d8e500b68.png") !important; }
[data-char*="帕特里琪娅"][data-action="脸红高兴"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/c3d3dc4aff5e583710bad29aec0d287546881babbf6f31f8.png") !important; }
[data-char*="帕特里琪娅"][data-action="难过"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/0a2b0a46fedfc92cf76259e19fa06ac859c0ffd312e4868a.png") !important; }
[data-char*="帕特里琪娅"][data-action="脸红难过"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/a7acbf78e53ae54ac900c0579b72664b80d2cc1da59c42d1.png") !important; }
[data-char*="帕特里琪娅"][data-action="疑惑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/cb7fee3d995f9ecffd25da073fd4614ab51e6f84929bce9c.png") !important; }
[data-char*="帕特里琪娅"][data-action="脸红疑惑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/7c79601f330d11908e112b8b2734f2a17b36acba075c7f03.png") !important; }
[data-char*="帕特里琪娅"][data-action="生气"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/872d0ee3cfd529b8ec3132c46aea19e963c1212a08c564d5.png") !important; }
[data-char*="帕特里琪娅"][data-action="脸红生气"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/4c389b351a330a4eca50628702ba1d43abd305c5def0c26c.png") !important; }
[data-char*="帕特里琪娅"][data-action="皱眉"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/4dffb231653d15c0dda4cc0f3f117ab8bc7c15b2c8a882f0.png") !important; }
[data-char*="帕特里琪娅"][data-action="脸红皱眉"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/a5ffb1394f0fdb7d9b13f59ffdc8bae8a8068b2af3d38d9c.png") !important; }
[data-char*="帕特里琪娅"][data-action="思考"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/a851b85778843e0a4f2730b1eb2c8bb4451db3a46a3a4b7e.png") !important; }
[data-char*="帕特里琪娅"][data-action="脸红思考"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/fc2234bef33ce83ecd0920cb7910f84f928615b7ad5b31f0.png") !important; }

/* --- 加莉泰娅 --- */
[data-char*="加莉泰娅"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/afbef5e55f6f940364db2f4b914370184230cc8e002f37af.png") !important; }
[data-char*="加莉泰娅"][data-action*="脸红"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/9fe1ca78b25bbf2415c2311697a913b8d64b34cf01733633.png") !important; }
[data-char*="加莉泰娅"][data-action="通常"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/afbef5e55f6f940364db2f4b914370184230cc8e002f37af.png") !important; }
[data-char*="加莉泰娅"][data-action="脸红通常"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/9fe1ca78b25bbf2415c2311697a913b8d64b34cf01733633.png") !important; }
[data-char*="加莉泰娅"][data-action="腹黑笑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/b7cf75108a177d759fae04c71b35bf645b9bf2f9024c79d7.png") !important; }
[data-char*="加莉泰娅"][data-action="脸红腹黑笑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/4e6a294e1b533e7c592e916bea105ec724e8dbdac084588f.png") !important; }
[data-char*="加莉泰娅"][data-action="害羞"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/99fff281b5782284b4a9ebecd2145bca9bfb5973db8dff98.png") !important; }
[data-char*="加莉泰娅"][data-action="惊讶"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/ac0cfdf48fdbaff44a61a8655d622360d8dbeea3c54c55e2.png") !important; }
[data-char*="加莉泰娅"][data-action="脸红惊讶"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/e8e1015bc147e112d82e7c04105bc2cd6ff3ca73bd5b9d58.png") !important; }
[data-char*="加莉泰娅"][data-action="高兴"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/1cab7ebfc4abbed0c1ed51302348d67fd96b02362fe54f66.png") !important; }
[data-char*="加莉泰娅"][data-action="脸红高兴"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/92652f0ca4e2b5a08fe2fd93d66d76b47facdb1e8f803ab9.png") !important; }
[data-char*="加莉泰娅"][data-action="难过"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/57a4cae115169583c1008765f57acfa6bb4b56a191badbf1.png") !important; }
[data-char*="加莉泰娅"][data-action="脸红难过"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/595eb426a33a6efb3c08da24208709bde99d6142923d1a0b.png") !important; }
[data-char*="加莉泰娅"][data-action="疑惑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/e12d3725743aa446d9fe612157a7375b983e921ea16afcc2.png") !important; }
[data-char*="加莉泰娅"][data-action="脸红疑惑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/47be8c9524b97cd49ea9544fa1a37214a5a0a05ca19340cd.png") !important; }
[data-char*="加莉泰娅"][data-action="生气"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/ab69dd29392c82282266e09764b5ec27a565bff6eb0d22b0.png") !important; }
[data-char*="加莉泰娅"][data-action="脸红生气"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/54be667c78af2b9669d50f0e00598be555e2937ac3005323.png") !important; }
[data-char*="加莉泰娅"][data-action="皱眉"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/a650a7b48f42fff517f876084346abb3abd5fe1976d3101d.png") !important; }
[data-char*="加莉泰娅"][data-action="脸红皱眉"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/7dedb765245e195b35d7335048162fe5393b7267e1b2a85d.png") !important; }
[data-char*="加莉泰娅"][data-action="思考"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/cb678b51d571efb24047a069fe5e066a57c77a86dfaa2313.png") !important; }
[data-char*="加莉泰娅"][data-action="脸红思考"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/59ad2d7fc6888cdc28a5d68600a37f1c156928c58ceaf5e2.png") !important; }

/* --- 盖欧露易丝 --- */
[data-char*="盖欧露易丝"] .custom-nvn-avatar-img, [data-char*="露易丝"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/80f2841ea5530359f4a924b182e2963f11d676a4db76088d.png") !important; }
[data-char*="盖欧露易丝"][data-action*="脸红"] .custom-nvn-avatar-img, [data-char*="露易丝"][data-action*="脸红"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/bc1de3a0d6084fad798acc68ca554f46ec3bd7620e4c0d9c.png") !important; }
[data-char*="盖欧露易丝"][data-action="通常"] .custom-nvn-avatar-img, [data-char*="露易丝"][data-action="通常"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/80f2841ea5530359f4a924b182e2963f11d676a4db76088d.png") !important; }
[data-char*="盖欧露易丝"][data-action="脸红通常"] .custom-nvn-avatar-img, [data-char*="露易丝"][data-action="脸红通常"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/bc1de3a0d6084fad798acc68ca554f46ec3bd7620e4c0d9c.png") !important; }
[data-char*="盖欧露易丝"][data-action="害羞"] .custom-nvn-avatar-img, [data-char*="露易丝"][data-action="害羞"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/150d438ad4d154fbf06ace72b7aec90b2049212dbace1bb9.png") !important; }
[data-char*="盖欧露易丝"][data-action="惊讶"] .custom-nvn-avatar-img, [data-char*="露易丝"][data-action="惊讶"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/e9524a1412e1e167fa7501681958dc538264b0f8e84aae76.png") !important; }
[data-char*="盖欧露易丝"][data-action="脸红惊讶"] .custom-nvn-avatar-img, [data-char*="露易丝"][data-action="脸红惊讶"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/dfffde2f41cfb4ece736fcea26f243b803124b3135abf629.png") !important; }
[data-char*="盖欧露易丝"][data-action="脸红高兴"] .custom-nvn-avatar-img, [data-char*="露易丝"][data-action="脸红高兴"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/287cc5c388e70f119c444b7c0e5173bb3c4e855dfef37339.png") !important; }
[data-char*="盖欧露易丝"][data-action="难过"] .custom-nvn-avatar-img, [data-char*="露易丝"][data-action="难过"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/688adcdb49a2432b4ba9805aaac2ec4f5d0c69038f6edb0e.png") !important; }
[data-char*="盖欧露易丝"][data-action="脸红难过"] .custom-nvn-avatar-img, [data-char*="露易丝"][data-action="脸红难过"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/e076068036533c5bb93531bb7ac687c59934448a84c5a988.png") !important; }
[data-char*="盖欧露易丝"][data-action="疑惑"] .custom-nvn-avatar-img, [data-char*="露易丝"][data-action="疑惑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/bf565ae93d2454be29aac130d6e7d3b196aaef3c2a0d9239.png") !important; }
[data-char*="盖欧露易丝"][data-action="脸红疑惑"] .custom-nvn-avatar-img, [data-char*="露易丝"][data-action="脸红疑惑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/4792b7063790640b5669f7057ca476902c3218e5a7260fc3.png") !important; }
[data-char*="盖欧露易丝"][data-action="生气"] .custom-nvn-avatar-img, [data-char*="露易丝"][data-action="生气"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/bcb6e555cd1366da48b60302785854949104c68db702f9a8.png") !important; }
[data-char*="盖欧露易丝"][data-action="脸红生气"] .custom-nvn-avatar-img, [data-char*="露易丝"][data-action="脸红生气"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/b9e49dcc99ef96e72511a5bf3918adfff5ead1fb81323de9.png") !important; }
[data-char*="盖欧露易丝"][data-action="皱眉"] .custom-nvn-avatar-img, [data-char*="露易丝"][data-action="皱眉"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/d617a6d45f20ee5d2c6fa12b7003375de93c955229e012e9.png") !important; }
[data-char*="盖欧露易丝"][data-action="脸红皱眉"] .custom-nvn-avatar-img, [data-char*="露易丝"][data-action="脸红皱眉"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/87c33acdfd8ecf3635905cf29fd02ec36026c1ec77c9bc60.png") !important; }
[data-char*="盖欧露易丝"][data-action="思考"] .custom-nvn-avatar-img, [data-char*="露易丝"][data-action="思考"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/b1b4593f95ef76b0d9de3e407003ddd8a97251def2fa8383.png") !important; }
[data-char*="盖欧露易丝"][data-action="脸红思考"] .custom-nvn-avatar-img, [data-char*="露易丝"][data-action="脸红思考"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/8515b94b81362d34f939b31c38b4ea3af58dd702045a26fb.png") !important; }

/* 王铠盖欧露易丝 特殊形态 */
[data-char*="王铠盖欧露易丝"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/aca05cddbcaec8447b1792d28b4c423057e36d89f349e629.png") !important; }
[data-char*="王铠盖欧露易丝"][data-action*="脸红"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/eb9f48183ae9df6ac3ae0588608daed6fd4d7b63ae8ea610.png") !important; }
[data-char*="王铠盖欧露易丝"][data-action="通常"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/aca05cddbcaec8447b1792d28b4c423057e36d89f349e629.png") !important; }
[data-char*="王铠盖欧露易丝"][data-action="脸红通常"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/eb9f48183ae9df6ac3ae0588608daed6fd4d7b63ae8ea610.png") !important; }
[data-char*="王铠盖欧露易丝"][data-action="害羞"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/175f86a760912b492d1484d5f2b2a1b8a06ca6d43dde48cc.png") !important; }
[data-char*="王铠盖欧露易丝"][data-action="惊讶"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/dda75e5431dbfd0cc68ee6fb964a38f0db03c74c188820d4.png") !important; }
[data-char*="王铠盖欧露易丝"][data-action="脸红惊讶"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/c1c74a8276a418d42bf59a566dea6dcd88a0c11a6c5a2b20.png") !important; }
[data-char*="王铠盖欧露易丝"][data-action="高兴"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/94f378a556387c066f9e0e6b271de7702b878be7811ee5a6.png") !important; }
[data-char*="王铠盖欧露易丝"][data-action="脸红高兴"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/da6671afdfa1e82b09ea95f331bb2f1c9a595ca56d49d075.png") !important; }
[data-char*="王铠盖欧露易丝"][data-action="难过"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/dcbbcdf7ec5fa4cf285eec3c9e2f8ddbad621827c6cebba6.png") !important; }
[data-char*="王铠盖欧露易丝"][data-action="脸红难过"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/44ac406584109d284a0e44f9eb220c592a1a76ad8b8e7c9f.png") !important; }
[data-char*="王铠盖欧露易丝"][data-action="疑惑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/4b3d6f774bca779ab74e346792f7149779011342d7ca7d8e.png") !important; }
[data-char*="王铠盖欧露易丝"][data-action="脸红疑惑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/586263ced2fac84294c59434c320f354c41ad0ba1e7d147b.png") !important; }
[data-char*="王铠盖欧露易丝"][data-action="生气"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/0c135a359dc112d0b305c9546dae330dc81b9a9309b0cc26.png") !important; }
[data-char*="王铠盖欧露易丝"][data-action="脸红生气"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/757193069b187f3c268a30faac5bdad4baa6a4579d2bebb4.png") !important; }
[data-char*="王铠盖欧露易丝"][data-action="皱眉"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/d75383a8efb3137c55746f00f87462cd11d2e5f34f942fbc.png") !important; }
[data-char*="王铠盖欧露易丝"][data-action="脸红皱眉"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/e05a70d424c42b2aa1d6103b963492945907fb3c3e5c1de8.png") !important; }
[data-char*="王铠盖欧露易丝"][data-action="思考"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/0829e245da81cfe5a8574558b40cc32d3d819078ecb47258.png") !important; }
[data-char*="王铠盖欧露易丝"][data-action="脸红思考"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/1d5bf642733994e79d7cb6d3cc72c089c6128b7e3452c01e.png") !important; }

/* --- 古伊奈 --- */
[data-char*="古伊奈"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/b6bfaa8e95ac22b482fef2f25949aa7e32c4ce6dbc25df7a.png") !important; }
[data-char*="古伊奈"][data-action*="脸红"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/ef44f14d73845b01d4f704bfd8f377b73b985356aa1f3c46.png") !important; }
[data-char*="古伊奈"][data-action="通常"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/b6bfaa8e95ac22b482fef2f25949aa7e32c4ce6dbc25df7a.png") !important; }
[data-char*="古伊奈"][data-action="脸红通常"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/ef44f14d73845b01d4f704bfd8f377b73b985356aa1f3c46.png") !important; }
[data-char*="古伊奈"][data-action="害羞"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/fe3d3231728c4c689207349720317927b83d9953f45e45ca.png") !important; }
[data-char*="古伊奈"][data-action="惊讶"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/825f06ae962aff8816bdc8294d0798926afd5cf65c6b0d2c.png") !important; }
[data-char*="古伊奈"][data-action="脸红惊讶"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/8a973ad843eff3b76d233c54412cca9980f36b9f6f57ef66.png") !important; }
[data-char*="古伊奈"][data-action="高兴"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/639bea2bb36e374ac227f4f00dfb7681952151d8992ab9de.png") !important; }
[data-char*="古伊奈"][data-action="脸红高兴"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/c443dac024bb2da115dc8c6126f9646855e6d04732c7cd4b.png") !important; }
[data-char*="古伊奈"][data-action="疑惑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/27e47af5fec5a561fe70dbac0f2e6f6b45641cca0e94a8e3.png") !important; }
[data-char*="古伊奈"][data-action="脸红疑惑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/5c0a9dd345d7993e2e8b3cde23368e8f071a1f734c74566c.png") !important; }
[data-char*="古伊奈"][data-action="生气"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/8827cf20a8068fc7dc517ce4e4563245f0165bc4f35cafa9.png") !important; }
[data-char*="古伊奈"][data-action="脸红生气"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/e693bca644249218a750bb9671750ab4afff097e13bb6b8c.png") !important; }
[data-char*="古伊奈"][data-action="思考"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/e49723775612c729adbfcacb16a567eb69e3d0cb4faa0547.png") !important; }
[data-char*="古伊奈"][data-action="脸红思考"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/087b3917b100f98c85af28fa0afafe4adcd5fb8c87af468e.png") !important; }

/* 王铠古伊奈 特殊形态 */
[data-char*="王铠古伊奈"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/c6536c8000938d0d02b3617978257fb2b9c078eb32f9a45a.png") !important; }
[data-char*="王铠古伊奈"][data-action*="脸红"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/13176b87d493ff800374d3456245bb664a17f112d4003abb.png") !important; }
[data-char*="王铠古伊奈"][data-action="通常"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/c6536c8000938d0d02b3617978257fb2b9c078eb32f9a45a.png") !important; }
[data-char*="王铠古伊奈"][data-action="脸红通常"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/13176b87d493ff800374d3456245bb664a17f112d4003abb.png") !important; }
[data-char*="王铠古伊奈"][data-action="害羞"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/13176b87d493ff800374d3456245bb664a17f112d4003abb.png") !important; }
[data-char*="王铠古伊奈"][data-action="惊讶"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/b19616f420407c684ed29ac5e67137b3d282a3723fc33979.png") !important; }
[data-char*="王铠古伊奈"][data-action="脸红惊讶"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/c48a9c0d763f5c0fc662dc9f37d2ea17481b85bb88b3facf.png") !important; }
[data-char*="王铠古伊奈"][data-action="高兴"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/ebb678bf32ddeb0d428a2e51863740d58c4f2cecf3e65e32.png") !important; }
[data-char*="王铠古伊奈"][data-action="脸红高兴"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/f63556f8b8f3e5e050c651008736e9668f4f66fa988579d5.png") !important; }
[data-char*="王铠古伊奈"][data-action="难过"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/863a02f354232d2c9c61d83a894ba6eb52ab711d6e2b448d.png") !important; }
[data-char*="王铠古伊奈"][data-action="脸红难过"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/a7c4087450dc21b056f5158e3959987a323a96cfbef8f06e.png") !important; }
[data-char*="王铠古伊奈"][data-action="疑惑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/98b771e822d7ec14d6dbca09bebf6534be8a19c1c7ebcebd.png") !important; }
[data-char*="王铠古伊奈"][data-action="脸红疑惑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/8a26fcbb543e1496d1e264e4afd6d10dbe9ad8fbbfb530dd.png") !important; }
[data-char*="王铠古伊奈"][data-action="生气"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/257be11ec28fe777afa6503077a31f96f25c589e169b02b7.png") !important; }
[data-char*="王铠古伊奈"][data-action="脸红生气"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/6dce23785def0c078b0dcd26f18769dffb82bfbf31602507.png") !important; }
[data-char*="王铠古伊奈"][data-action="皱眉"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/ba0cab04565c06ad7ac651b01a57100da9bb4a7345aff993.png") !important; }
[data-char*="王铠古伊奈"][data-action="脸红皱眉"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/200125972c0b60e953540e8cc2411534d9f36672a0a7cea3.png") !important; }
[data-char*="王铠古伊奈"][data-action="思考"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/d833f7d5d0daf22176b82474e9839b8167b394095be2ef2d.png") !important; }
[data-char*="王铠古伊奈"][data-action="脸红思考"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/332deb96d8e0dc1f8e4b5360686f97f1751882c247729c2e.png") !important; }

/* --- 斯提亚拉 --- */
[data-char*="斯提亚拉"] .custom-nvn-avatar-img, [data-char*="提亚拉"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/b3b47ee8648ac6c5930081c384263903867ff6907683f228.png") !important; }
[data-char*="斯提亚拉"][data-action*="脸红"] .custom-nvn-avatar-img, [data-char*="提亚拉"][data-action*="脸红"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/0f047f08e5625c317b0b90d75d10dbeaa8e3f318c8987cb9.png") !important; }
[data-char*="斯提亚拉"][data-action="通常"] .custom-nvn-avatar-img, [data-char*="提亚拉"][data-action="通常"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/b3b47ee8648ac6c5930081c384263903867ff6907683f228.png") !important; }
[data-char*="斯提亚拉"][data-action="脸红通常"] .custom-nvn-avatar-img, [data-char*="提亚拉"][data-action="脸红通常"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/0f047f08e5625c317b0b90d75d10dbeaa8e3f318c8987cb9.png") !important; }
[data-char*="斯提亚拉"][data-action="得意"] .custom-nvn-avatar-img, [data-char*="提亚拉"][data-action="得意"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/a300eed081c0acce08c06a5bde59630219a0039677cba1ce.png") !important; }
[data-char*="斯提亚拉"][data-action="脸红得意"] .custom-nvn-avatar-img, [data-char*="提亚拉"][data-action="脸红得意"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/b09551f18b5b3b3f9899fb95ec3b8a670a58b184a3229359.png") !important; }
[data-char*="斯提亚拉"][data-action="脸红腹黑笑"] .custom-nvn-avatar-img, [data-char*="提亚拉"][data-action="脸红腹黑笑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/e57e17329d0d72514177bfb0e7efe0cdaf384b5ef934dff3.png") !important; }
[data-char*="斯提亚拉"][data-action="害羞"] .custom-nvn-avatar-img, [data-char*="提亚拉"][data-action="害羞"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/b606ead18a7ea2d0a47c2438bd6ee49f15a826cada69e6b6.png") !important; }
[data-char*="斯提亚拉"][data-action="难过"] .custom-nvn-avatar-img, [data-char*="提亚拉"][data-action="难过"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/682107a0eed92f0d142f30c323c214b6a2f56a4e1e4c4410.png") !important; }
[data-char*="斯提亚拉"][data-action="脸红难过"] .custom-nvn-avatar-img, [data-char*="提亚拉"][data-action="脸红难过"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/893c0d0d7e87dd1c45e4fa992af75120b156fd86cc2f7d1e.png") !important; }
[data-char*="斯提亚拉"][data-action="疑惑"] .custom-nvn-avatar-img, [data-char*="提亚拉"][data-action="疑惑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/e2a8e41600cf16a6252f8b839e28085bd3b2dbeeb7a15248.png") !important; }
[data-char*="斯提亚拉"][data-action="脸红疑惑"] .custom-nvn-avatar-img, [data-char*="提亚拉"][data-action="脸红疑惑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/02d1657536ccff64a38ceca6a9d2a13ec3427478b87532d7.png") !important; }
[data-char*="斯提亚拉"][data-action="生气"] .custom-nvn-avatar-img, [data-char*="提亚拉"][data-action="生气"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/fafb11ae70be489faa85a4dc3ab90ef8db2c4837a3165959.png") !important; }
[data-char*="斯提亚拉"][data-action="脸红生气"] .custom-nvn-avatar-img, [data-char*="提亚拉"][data-action="脸红生气"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/fa13a02ea03c99b4f8259967f660b0b8015cfc2f3e3d630d.png") !important; }
[data-char*="斯提亚拉"][data-action="皱眉"] .custom-nvn-avatar-img, [data-char*="提亚拉"][data-action="皱眉"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/371b9a66145afd235b135256ffd0654877e76804c17e5657.png") !important; }
[data-char*="斯提亚拉"][data-action="脸红皱眉"] .custom-nvn-avatar-img, [data-char*="提亚拉"][data-action="脸红皱眉"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/e109e67d39ac5efc682638a72846d6e174cf61ce807e7597.png") !important; }
[data-char*="斯提亚拉"][data-action="思考"] .custom-nvn-avatar-img, [data-char*="提亚拉"][data-action="思考"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/8fb21481b21adca51ca1e9d2931241841a8a3797c4a08b64.png") !important; }
[data-char*="斯提亚拉"][data-action="脸红思考"] .custom-nvn-avatar-img, [data-char*="提亚拉"][data-action="脸红思考"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/28/2d17cf8998a1e89506a3e8771881bca995bab4d70448f849.png") !important; }

/* =========================================================================
 * 🌟 新增角色表情差分映射
 * ========================================================================= */
/* --- 艾尔希（非IV形态） --- */
[data-char*="艾尔希"]:not([data-char*="IV"]) .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/37b20dcdd51edc1af6a386bbab63d98760b6124e5ca6c745.png") !important; }
[data-char*="艾尔希"]:not([data-char*="IV"])[data-action*="脸红"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/85f028be9e388449aef3c315b00622a5c0e2e8fa00b80c3e.png") !important; }
[data-char*="艾尔希"]:not([data-char*="IV"])[data-action="通常"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/37b20dcdd51edc1af6a386bbab63d98760b6124e5ca6c745.png") !important; }
[data-char*="艾尔希"]:not([data-char*="IV"])[data-action="脸红通常"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/85f028be9e388449aef3c315b00622a5c0e2e8fa00b80c3e.png") !important; }
[data-char*="艾尔希"]:not([data-char*="IV"])[data-action="得意"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/65912b25b5168560dd308c5439688d0e5acb6b8d11526fda.png") !important; }
[data-char*="艾尔希"]:not([data-char*="IV"])[data-action="脸红得意"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/3d179784805d34f9f8dfb5133818504988555e526bdf7e7b.png") !important; }
[data-char*="艾尔希"]:not([data-char*="IV"])[data-action="腹黑笑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/cc76429b32b39ba9ac956416530885d34230eb565189dbaf.png") !important; }
[data-char*="艾尔希"]:not([data-char*="IV"])[data-action="脸红腹黑笑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/dabd88a68e72961cd6c5d680a386d543410dcdae509717ba.png") !important; }
[data-char*="艾尔希"]:not([data-char*="IV"])[data-action="害羞"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/224f9339288d816637c8fe66f7d5e80e8124be9d40068d77.png") !important; }
[data-char*="艾尔希"]:not([data-char*="IV"])[data-action="惊讶"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/2faee8909b398f0192e444ac8c90e6da4db1032a3ac553f2.png") !important; }
[data-char*="艾尔希"]:not([data-char*="IV"])[data-action="脸红惊讶"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/3a323b5c5bea7c751c9cab654e7d6de37ed9acf2b43647f9.png") !important; }
[data-char*="艾尔希"]:not([data-char*="IV"])[data-action="高兴"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/1234e92dee85ea0dec007ddf7bdd2a57d2f1cc04004a328d.png") !important; }
[data-char*="艾尔希"]:not([data-char*="IV"])[data-action="脸红高兴"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/b7337f157c90692d53b6d4c9370fba4c9aa8a47321ee51f2.png") !important; }
[data-char*="艾尔希"]:not([data-char*="IV"])[data-action="难过"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/8b5557eebdecf3e4086df558bcca50d5ac16233d300308d3.png") !important; }
[data-char*="艾尔希"]:not([data-char*="IV"])[data-action="脸红难过"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/7ac25bd232e6010002b2d3d67102d00a06cd56971fe003bc.png") !important; }
[data-char*="艾尔希"]:not([data-char*="IV"])[data-action="疑惑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/fcc9072a0f7ead7dafec6bb3513cd012ba6d49f1c340bda5.png") !important; }
[data-char*="艾尔希"]:not([data-char*="IV"])[data-action="脸红疑惑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/974bffcaf31efa5809b0720ddefafe077f87b85eaee489bc.png") !important; }
[data-char*="艾尔希"]:not([data-char*="IV"])[data-action="生气"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/a90104e156f1e377310737711203e0110205bc3e3a1b7e3b.png") !important; }
[data-char*="艾尔希"]:not([data-char*="IV"])[data-action="脸红生气"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/6f561f1854fbc581562f6caec311f87cf4ad71ee5775912d.png") !important; }

/* --- 艾尔希IV --- */
[data-char*="艾尔希IV"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/4b27857c130b16f44741200c2c09a68fadf3e2ff211d37b1.png") !important; }
[data-char*="艾尔希IV"][data-action*="脸红"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/566d2fa85168ee56664204b545ef31c7b3f62c76fd2bc723.png") !important; }
[data-char*="艾尔希IV"][data-action="通常"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/4b27857c130b16f44741200c2c09a68fadf3e2ff211d37b1.png") !important; }
[data-char*="艾尔希IV"][data-action="脸红通常"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/566d2fa85168ee56664204b545ef31c7b3f62c76fd2bc723.png") !important; }
[data-char*="艾尔希IV"][data-action="得意"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/1f02a7fa646433cf1e1920a8d976bb41fc13d49e49b44131.png") !important; }
[data-char*="艾尔希IV"][data-action="脸红得意"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/001209b0635444d158e43c12bbfe1b9e307bcb328bb58288.png") !important; }
[data-char*="艾尔希IV"][data-action="腹黑笑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/3df3abda9fb93c74598fa9ba03f500ba9be9753efcb73282.png") !important; }
[data-char*="艾尔希IV"][data-action="脸红腹黑笑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/2ac70408988a1d8477af80cf5cc85951b00004d48e83d857.png") !important; }
[data-char*="艾尔希IV"][data-action="害羞"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/e36da7a3eebf4107b2d35378474877001d2714a6cf01c0d7.png") !important; }
[data-char*="艾尔希IV"][data-action="惊讶"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/85a3e1532ae262aa8cc2a914c4ac40c6f5fec772511fd52e.png") !important; }
[data-char*="艾尔希IV"][data-action="脸红惊讶"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/8416f64afb2e9c3e506069f946998942ef1a02d30ea945e8.png") !important; }
[data-char*="艾尔希IV"][data-action="高兴"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/3bfb2f1fb615a3c00a6d35cbbd7341a346bb1db5ed56cd03.png") !important; }
[data-char*="艾尔希IV"][data-action="脸红高兴"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/59997c3cfa24c5a0348c63bb6ebb6d6f962bdfeb7b18c2a4.png") !important; }
[data-char*="艾尔希IV"][data-action="难过"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/2ba96354d9215e0f80159eb84dcf21328af33a392fa899a7.png") !important; }
[data-char*="艾尔希IV"][data-action="脸红难过"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/e2e73512540769975ba1355ea6739e55b297abb4740e1e19.png") !important; }
[data-char*="艾尔希IV"][data-action="疑惑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/10560b6575aef38fe9c8c7345440f454c32a3667157a70ad.png") !important; }
[data-char*="艾尔希IV"][data-action="脸红疑惑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/1054effb57404ba3a8a6b1f120a0216165b1c8406962d551.png") !important; }
[data-char*="艾尔希IV"][data-action="生气"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/701b3039eb79c36b7a52047dc1309633419fbde611d045c5.png") !important; }
[data-char*="艾尔希IV"][data-action="脸红生气"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/8215364816a1f9005b106f6ea3f77ceccfc88768bd96cc69.png") !important; }

/* --- 狄娜 --- */
[data-char*="狄娜"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/1dadf45d3588c9cfec1d46185611170cc753da727fa980a1.png") !important; }
[data-char*="狄娜"][data-action*="脸红"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/c770fac4a487e015bdb9cc6bde706bf6892c38f99e21e3ad.png") !important; }
[data-char*="狄娜"][data-action="通常"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/1dadf45d3588c9cfec1d46185611170cc753da727fa980a1.png") !important; }
[data-char*="狄娜"][data-action="脸红通常"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/c770fac4a487e015bdb9cc6bde706bf6892c38f99e21e3ad.png") !important; }
[data-char*="狄娜"][data-action="害羞"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/b01bc9840d3fd7f24118816f12e90039b080711e4ca9f2c4.png") !important; }
[data-char*="狄娜"][data-action="高兴"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/60b50f9b7a4f7f577eb7f1ba0a488c4970662223902c01dc.png") !important; }
[data-char*="狄娜"][data-action="脸红高兴"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/4fbc84e3ade88eefa9e72442e144af098d38bebecebeb156.png") !important; }
[data-char*="狄娜"][data-action="难过"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/b2921af6471fafc2781f4f43e4b3e8ee3b3e61c3cb85fe3a.png") !important; }
[data-char*="狄娜"][data-action="脸红难过"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/722ab7a0e009eaaa40dea22f6bcd4fdb29202c2fe1b833f7.png") !important; }
[data-char*="狄娜"][data-action="疑惑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/1fffca2187a0bfb88f953df33b292ddb7e84a509d4d76318.png") !important; }
[data-char*="狄娜"][data-action="脸红疑惑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/73c93d43abd97fe98132203323acdc071adfe655038855ea.png") !important; }
[data-char*="狄娜"][data-action="生气"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/ac995f2437a82eab4da201f7334b88288702601277b1a36d.png") !important; }
[data-char*="狄娜"][data-action="脸红生气"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/c88c7a3397f1d6ba878d70ab4c6a642f4f66de9533b4a96a.png") !important; }
[data-char*="狄娜"][data-action="皱眉"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/4f9cd0122aaa34c3f9b1d971fb317e2fd1282555ef371970.png") !important; }
[data-char*="狄娜"][data-action="脸红皱眉"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/09883883287f59e3f751d29869acbcc9cc7eeea9749eab7f.png") !important; }
[data-char*="狄娜"][data-action="思考"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/580577d2cad01770fba088dd88193fc04c82968db96736a3.png") !important; }
[data-char*="狄娜"][data-action="脸红思考"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/577a958a074fbfd3024c660fed097ebda9efcf9cb4cd1ac2.png") !important; }

/* --- 卡莲 --- */
[data-char*="卡莲"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/f42a78c5c131cbc403c3be55402bb41d33586ace93d01d27.png") !important; }
[data-char*="卡莲"][data-action*="脸红"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/66544dfdef89acb53431ec35d054ed9be67609268399dad0.png") !important; }
[data-char*="卡莲"][data-action="通常"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/f42a78c5c131cbc403c3be55402bb41d33586ace93d01d27.png") !important; }
[data-char*="卡莲"][data-action="脸红通常"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/66544dfdef89acb53431ec35d054ed9be67609268399dad0.png") !important; }
[data-char*="卡莲"][data-action="害羞"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/2e97a412dcd4d2541cf3a99bfe3e1e99948968fdcd24cc9d.png") !important; }
[data-char*="卡莲"][data-action="惊讶"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/e37206253e3091b87ee5f19996dc4778ae7b992f586eeeab.png") !important; }
[data-char*="卡莲"][data-action="脸红惊讶"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/e0efdd6d72a01d2c4a6fb482fd14d482a158e757a903bd6c.png") !important; }
[data-char*="卡莲"][data-action="难过"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/94433bb53a241058910eabf5e091129f8f9e31cf2482fc0c.png") !important; }
[data-char*="卡莲"][data-action="脸红难过"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/eea684f2d6c974e7d45c3930dc7307ff250eae201dfd6650.png") !important; }
[data-char*="卡莲"][data-action="疑惑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/862beb527ae474e90a0eea775a88f7773c1ce68e96814663.png") !important; }
[data-char*="卡莲"][data-action="脸红疑惑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/ba6f0be3175da241ac8670c45d6ddacc5549688f93b3f4e1.png") !important; }
[data-char*="卡莲"][data-action="生气"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/e224d19888481c461d45c0ad0d659889e54496469ff27a8f.png") !important; }
[data-char*="卡莲"][data-action="脸红生气"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/e2b38879f9263569f4371d091ba0b74fe80fc250098c37fb.png") !important; }
[data-char*="卡莲"][data-action="思考"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/fac71b6b280ed66b5c642eadd30d38dc9f9e4883c9e3d378.png") !important; }
[data-char*="卡莲"][data-action="脸红思考"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/9b075b8ffb69c2c39b02a6e9abbc1e511dd514335c7185a9.png") !important; }

/* --- 柯萝特 --- */
[data-char*="柯萝特"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/48f0e97d0043fe4bb899f512a032bb302b834aeb8c44d345.png") !important; }
[data-char*="柯萝特"][data-action*="脸红"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/4d1489787890e682d12a73d3bd5414a40346e8a2d7c8afca.png") !important; }
[data-char*="柯萝特"][data-action="通常"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/48f0e97d0043fe4bb899f512a032bb302b834aeb8c44d345.png") !important; }
[data-char*="柯萝特"][data-action="脸红通常"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/4d1489787890e682d12a73d3bd5414a40346e8a2d7c8afca.png") !important; }
[data-char*="柯萝特"][data-action="害羞"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/4d1489787890e682d12a73d3bd5414a40346e8a2d7c8afca.png") !important; }
[data-char*="柯萝特"][data-action="惊讶"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/0b6bd8935e8bcdc9de8c5630507174dc654f1f8466c4c4ea.png") !important; }
[data-char*="柯萝特"][data-action="脸红惊讶"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/fe24b8f032e6509bc60ac1a932cbeb09ecc9dc00bf4455df.png") !important; }
[data-char*="柯萝特"][data-action="高兴"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/8a70c405675fbac537159d0d8b3021810ea4985778c023c0.png") !important; }
[data-char*="柯萝特"][data-action="脸红高兴"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/ce5bf7eb6016c466420f5138719d723da0c02457c22934d6.png") !important; }
[data-char*="柯萝特"][data-action="难过"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/01e6791976b1ea0f6dfd3275207652017f1b348d89fcfd9d.png") !important; }
[data-char*="柯萝特"][data-action="脸红难过"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/118d5d45a8ea122125844a5642650b533dc3f9564849e4c6.png") !important; }
[data-char*="柯萝特"][data-action="疑惑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/6c6aa49b43df7afb708d777f80fc6e2cc8e7e719d29e7d55.png") !important; }
[data-char*="柯萝特"][data-action="脸红疑惑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/8961919333912dff35cb4de243fc3b1a8f88edd552fd3243.png") !important; }
[data-char*="柯萝特"][data-action="生气"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/e73620423545e84a77d54ee583118e37e9a23bca4924a830.png") !important; }
[data-char*="柯萝特"][data-action="脸红生气"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/09/29/4b2f49ed9df6627e07e4267f5acf3a232ac1acdc129de124.png") !important; }
/* --- 托莉娜（非魔化） --- */
[data-char*="托莉娜"]:not([data-char*="魔化"]) .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/02/baf1073fccd03e0d73215a07dc7621448d075e160cd34497.png") !important; }
[data-char*="托莉娜"]:not([data-char*="魔化"])[data-action*="脸红"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/02/299739dcdea7d2bc4725efcd849fdae0aabb9588d6a72a2e.png") !important; }
[data-char*="托莉娜"]:not([data-char*="魔化"])[data-action="通常"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/02/baf1073fccd03e0d73215a07dc7621448d075e160cd34497.png") !important; }
[data-char*="托莉娜"]:not([data-char*="魔化"])[data-action="脸红通常"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/02/299739dcdea7d2bc4725efcd849fdae0aabb9588d6a72a2e.png") !important; }
[data-char*="托莉娜"]:not([data-char*="魔化"])[data-action="得意"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/02/f7be1fb744f75e5f95f3a530dd4b3782d891b304a20d4066.png") !important; }
[data-char*="托莉娜"]:not([data-char*="魔化"])[data-action="脸红得意"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/02/ae670ff6a6edf4a121b8fc65fcd53a2d35a0ad9d81813e53.png") !important; }
[data-char*="托莉娜"]:not([data-char*="魔化"])[data-action="腹黑笑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/02/bc8feaa2f1650dc4478063bb8dfdb1575376dab630006b8b.png") !important; }
[data-char*="托莉娜"]:not([data-char*="魔化"])[data-action="脸红腹黑笑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/02/bebaca0840fe6ccb6ba72f27ae2cf95f73b4395504f86d2a.png") !important; }
[data-char*="托莉娜"]:not([data-char*="魔化"])[data-action="害羞"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/02/db9feab4694e58c6eee0522fafb68a05c19cc77628188049.png") !important; }
[data-char*="托莉娜"]:not([data-char*="魔化"])[data-action="惊讶"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/02/7eea1a84d1532f8c40f2ae9c01a5b4885a4cad51e815b3ac.png") !important; }
[data-char*="托莉娜"]:not([data-char*="魔化"])[data-action="脸红惊讶"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/02/b76da647f5e6f17177eccdeb6f2dce97e0fdd4499dd65011.png") !important; }
[data-char*="托莉娜"]:not([data-char*="魔化"])[data-action="高兴"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/02/c3cc7128f0792769a5355923be3069f6456abfb94e779af8.png") !important; }
[data-char*="托莉娜"]:not([data-char*="魔化"])[data-action="脸红高兴"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/02/6ae91c018ed2f2c40ec670578a946fe0806d98794cd00844.png") !important; }
[data-char*="托莉娜"]:not([data-char*="魔化"])[data-action="难过"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/02/6db176aaac1799586cf48b8591a77349a15c4039c3a78c70.png") !important; }
[data-char*="托莉娜"]:not([data-char*="魔化"])[data-action="脸红难过"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/02/b1ff45960712b3b9cff6f897b9399e1be9539bc25c968f34.png") !important; }
[data-char*="托莉娜"]:not([data-char*="魔化"])[data-action="疑惑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/02/af767b08c9a52d5e3bb9501fdb8c9f5cdb17ac672e73a122.png") !important; }
[data-char*="托莉娜"]:not([data-char*="魔化"])[data-action="脸红疑惑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/02/f08f27f2a389b5e2467ec61b3cc5df51894c11acb6593b61.png") !important; }
[data-char*="托莉娜"]:not([data-char*="魔化"])[data-action="生气"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/02/307d1580628281236bb8bf415714216adcf64894bc596580.png") !important; }
[data-char*="托莉娜"]:not([data-char*="魔化"])[data-action="脸红生气"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/02/053ab5c737903017db9aa763225e68b5088256639e2414b4.png") !important; }
[data-char*="托莉娜"]:not([data-char*="魔化"])[data-action="皱眉"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/02/a5c073b1575343951b3076e2d29e24d0e386f48810a10a9f.png") !important; }
[data-char*="托莉娜"]:not([data-char*="魔化"])[data-action="脸红皱眉"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/02/eaa05a29df4daeda5960328ab873574690156436e6f43580.png") !important; }
[data-char*="托莉娜"]:not([data-char*="魔化"])[data-action="思考"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/02/a7af863d7e3c2e7bd9a32ebab167247f23cc220780fec153.png") !important; }
[data-char*="托莉娜"]:not([data-char*="魔化"])[data-action="脸红思考"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/02/99405da3d05603fe876092a97731251a51579a3d122c0477.png") !important; }

/* --- 魔化托莉娜 --- */
[data-char*="魔化托莉娜"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/02/96242e499f06db45ed4c32f2b282a0be664e6cca44cd8dca.png") !important; }
[data-char*="魔化托莉娜"][data-action*="脸红"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/02/091b1ce9b8d9abdc687b3cc4841c710c3e2d2f4b6df4cb6f.png") !important; }
[data-char*="魔化托莉娜"][data-action="通常"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/02/96242e499f06db45ed4c32f2b282a0be664e6cca44cd8dca.png") !important; }
[data-char*="魔化托莉娜"][data-action="脸红通常"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/02/091b1ce9b8d9abdc687b3cc4841c710c3e2d2f4b6df4cb6f.png") !important; }
[data-char*="魔化托莉娜"][data-action="得意"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/02/e5417a69241effcd5a956b94612b7c1c1ccd22964e02d33b.png") !important; }
[data-char*="魔化托莉娜"][data-action="脸红得意"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/02/b4a5b4e0bcc7182997973a9d2e3991832d35342057b42b5a.png") !important; }
[data-char*="魔化托莉娜"][data-action="腹黑笑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/02/eadb03e64018e3b659760992853e1574d3ee830dc11fc5e6.png") !important; }
[data-char*="魔化托莉娜"][data-action="脸红腹黑笑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/02/96964e62d3bf38d7f93b705073f479bda13c5e6536b39392.png") !important; }
[data-char*="魔化托莉娜"][data-action="害羞"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/02/78f84f2dfcbf44290bfc2cee131200f79c60a5ed2fb39310.png") !important; }
[data-char*="魔化托莉娜"][data-action="惊讶"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/02/2ca26f2a99f8d479540bcc3b5b1f41f2ca7a54ee8420e83c.png") !important; }
[data-char*="魔化托莉娜"][data-action="脸红惊讶"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/02/777be016a255ea82f36de741f2f08e4c0520a316a2e02bf5.png") !important; }
[data-char*="魔化托莉娜"][data-action="高兴"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/02/a59344ba7c8f0e1df6e8debafaa3cca8673acaf46b6f424c.png") !important; }
[data-char*="魔化托莉娜"][data-action="脸红高兴"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/02/72d22ba1a3e96bfae13687fae5e56f68bfce09e860579710.png") !important; }
[data-char*="魔化托莉娜"][data-action="难过"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/02/5c9bba9aaec8af4d9524da33998b733c12fb8964f2d7e5fe.png") !important; }
[data-char*="魔化托莉娜"][data-action="脸红难过"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/02/78f84f2dfcbf44290bfc2cee131200f79c60a5ed2fb39310.png") !important; }
[data-char*="魔化托莉娜"][data-action="疑惑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/02/8717bd29acb04f330f79725b056cb1b5d98da14a9294166a.png") !important; }
[data-char*="魔化托莉娜"][data-action="脸红疑惑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/02/0444c4b1b32025fed389d59d59d2e31af5e7de2a04342dc3.png") !important; }
[data-char*="魔化托莉娜"][data-action="生气"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/02/a7e5fe291031f3c71ea4432e6457ea0422050f916d980b51.png") !important; }
[data-char*="魔化托莉娜"][data-action="脸红生气"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/02/6124f3508370a9db35b4fa49c69ca01ee1563dff799aab7d.png") !important; }
[data-char*="魔化托莉娜"][data-action="皱眉"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/02/16854a7dfede75a82a8132686c12c5b8d5f27aa1134e37c6.png") !important; }
[data-char*="魔化托莉娜"][data-action="脸红皱眉"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/02/517557917e35c8a54f608f792cc0b0855be9ddedc30a1ffc.png") !important; }
[data-char*="魔化托莉娜"][data-action="思考"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/02/1e7fd2b48e4c4efbbe6a29d41bd8efd5bb0febd059da662b.png") !important; }
[data-char*="魔化托莉娜"][data-action="脸红思考"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/02/f9929351b455a0304f627b37a49e8c9d1fa906a6cbfc85bf.png") !important; }

/* --- 一之濑雫 / 雫 --- */
div.custom-nvn-dialogue:is([data-char*="一之濑雫"], ) .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/02/13bcc39120a81f21da53e7602f9fb44be44c3589799d5a5c.png") !important; }
div.custom-nvn-dialogue:is([data-char*="一之濑雫"], )[data-action*="脸红"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/02/4b239bc073875aef5326c9d1e0d0c4a1ee7baace45c60693.png") !important; }
div.custom-nvn-dialogue:is([data-char*="一之濑雫"], )[data-action="通常"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/02/13bcc39120a81f21da53e7602f9fb44be44c3589799d5a5c.png") !important; }
div.custom-nvn-dialogue:is([data-char*="一之濑雫"], )[data-action="脸红通常"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/02/4b239bc073875aef5326c9d1e0d0c4a1ee7baace45c60693.png") !important; }
div.custom-nvn-dialogue:is([data-char*="一之濑雫"], )[data-action="得意"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/02/09e26bced46e30d238f6984b626886c2bc09133743761b6c.png") !important; }
div.custom-nvn-dialogue:is([data-char*="一之濑雫"], )[data-action="脸红得意"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/02/5dbfa091a61d2bb085d80aa2e533c1de99a26b13f6ae5a74.png") !important; }
div.custom-nvn-dialogue:is([data-char*="一之濑雫"], )[data-action="惊讶"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/02/bcfa3d9a0704c752b7831fde035c8a5415871ad245e3bede.png") !important; }
div.custom-nvn-dialogue:is([data-char*="一之濑雫"], )[data-action="脸红惊讶"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/02/31f6ab4b8cc959d533a980e09ee2180ef753b4c544c86058.png") !important; }
div.custom-nvn-dialogue:is([data-char*="一之濑雫"], )[data-action="高兴"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/02/041b001eb884aa12b5a6d75225fe246d867ddfc51ff4cbc1.png") !important; }
div.custom-nvn-dialogue:is([data-char*="一之濑雫"], )[data-action="脸红高兴"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/02/cd59b86e6bbbe23bb9be7e17ecd97d8cb7a78ff84194fce8.png") !important; }
div.custom-nvn-dialogue:is([data-char*="一之濑雫"], )[data-action="难过"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/02/1578f5cc3a5ed39f4808cae1f7dab4e38dcd5cc8fd06d60e.png") !important; }
div.custom-nvn-dialogue:is([data-char*="一之濑雫"], )[data-action="脸红难过"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/02/6c41535ce1b1b6ee525a4fb24ba4a0bff6b69ff0d128c154.png") !important; }
div.custom-nvn-dialogue:is([data-char*="一之濑雫"], )[data-action="疑惑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/02/3aae8af8ee178147ff154a7864a49893cc9aca1bda92c641.png") !important; }
div.custom-nvn-dialogue:is([data-char*="一之濑雫"], )[data-action="脸红疑惑"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/02/170b67c64cc65605fef822d807ac412adb19b0a78c06fa18.png") !important; }
div.custom-nvn-dialogue:is([data-char*="一之濑雫"], )[data-action="生气"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/02/77c33be9a76812b4a21d3e0b5d839ec729000848790ec2ea.png") !important; }
div.custom-nvn-dialogue:is([data-char*="一之濑雫"], )[data-action="脸红生气"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/02/df26f28a473ef7bb2b578813ce463c7a85877b0eb75e52ec.png") !important; }
div.custom-nvn-dialogue:is([data-char*="一之濑雫"], )[data-action="皱眉"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/02/6e45c3fc43f53acf2e81b12d04267548a237a427ca49fc97.png") !important; }
div.custom-nvn-dialogue:is([data-char*="一之濑雫"], )[data-action="脸红皱眉"] .custom-nvn-avatar-img { background-image: url("https://origin.picgo.net/2026/10/02/2bbc4a6ff0d208945286f8f46ec703efd56db0f91171ce3a.png") !important; }
/* =========================================================================
 * 🌟 纯透明全屏居中大立绘映射
 * ========================================================================= */
.custom-nvn-avatar-popover .custom-nvn-modal-content { display: none !important; }

.custom-nvn-avatar-popover[open] summary::before {
  content: "" !important;
  position: fixed !important;
  inset: 0 !important;
  width: 100vw !important;
  height: 100vh !important;
  z-index: 2147483640 !important;
  background: transparent !important;
  cursor: pointer !important;
  display: block !important;
}

.custom-nvn-avatar-popover[open] .custom-nvn-modal-content {
  position: fixed !important;
  inset: 0 !important;
  width: 100vw !important;
  height: 100vh !important;
  z-index: 2147483641 !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  pointer-events: none !important;
}

.custom-nvn-portrait-full {
  max-width: 88vw !important;
  max-height: 88vh !important;
  width: auto !important;
  height: auto !important;
  object-fit: contain !important;
  filter: drop-shadow(0 10px 30px rgba(0, 0, 0, 0.85)) !important;
  user-select: none !important;
  -webkit-user-drag: none !important;
  pointer-events: none !important;
}

/* 老角色与既有角色大图 */
div.custom-nvn-dialogue:is([data-char*="克蕾雅"], [data-char*="卢克蕾齐雅"]) .custom-nvn-portrait-full { content: url("https://origin.picgo.net/2026/09/17/ac92bf314de5fc2fb6488b395a70a66e25515781bb8ce916.png") !important; }
div.custom-nvn-dialogue:is([data-char*="莉莉娅"], [data-char*="莉莉娅"]) .custom-nvn-portrait-full { content: url("https://origin.picgo.net/2026/09/17/bd044dfa7368a3ba194fb70aba371bb3b6c8d9d8549fdba4.png") !important; }
div.custom-nvn-dialogue:is([data-char*="拉姆内"], [data-char*="拉姆"]) .custom-nvn-portrait-full { content: url("https://origin.picgo.net/2026/09/17/dc9fbb30e0fcad68889c2cfec6b44be64df519f948e21102.png") !important; }
div.custom-nvn-dialogue:is([data-char*="梅拉妮"], [data-char*="梅拉"]) .custom-nvn-portrait-full { content: url("https://origin.picgo.net/2026/09/17/e96503f65df8e12335d3feaea70d815cffe85f3f45f159d0.png") !important; }
div.custom-nvn-dialogue[data-char*="艾拉"] .custom-nvn-portrait-full { content: url("https://origin.picgo.net/2026/09/17/d499b077a20483ccec94a8f8767d7ed9fbcb078642081343.png") !important; }
div.custom-nvn-dialogue[data-char*="阿黛拉"] .custom-nvn-portrait-full { content: url("https://origin.picgo.net/2026/09/17/f805921447107f7a18959bcb44e0450aaa9ab7a77f7f4089.png") !important; }
div.custom-nvn-dialogue[data-char*="伊莉丝"] .custom-nvn-portrait-full { content: url("https://origin.picgo.net/2026/09/19/d1e3701a4b70c450df76c7be4db7a226dff0f9fc5cf83559.png") !important; }
div.custom-nvn-dialogue[data-char*="丽塔"] .custom-nvn-portrait-full { content: url("https://origin.picgo.net/2026/09/19/925f8d71cb2fac2c2a8a3bb41ef16a20c88912bec412ddb7.png") !important; }
div.custom-nvn-dialogue:is([data-char*="菲娅娜"], [data-char*="菲娅"]) .custom-nvn-portrait-full { content: url("https://origin.picgo.net/2026/09/19/dd1a26263d3cbda4f6835d6e438a71bd37e1d1583271651e.png") !important; }
div.custom-nvn-dialogue[data-char*="露娜"] .custom-nvn-portrait-full { content: url("https://origin.picgo.net/2026/09/19/e4f006d8683d57ebe4b1015c456fb2902365d39fba89f736.png") !important; }
div.custom-nvn-dialogue[data-char*="夏洛特"]:not([data-char*="驱魔"]) .custom-nvn-portrait-full { content: url("https://origin.picgo.net/2026/09/25/afbc6af184ba84ce4ff48bf5ff959fd7613cfd269a0d8c57.png") !important; }
div.custom-nvn-dialogue[data-char*="驱魔夏洛特"] .custom-nvn-portrait-full { content: url("https://origin.picgo.net/2026/09/25/80c5b83ebc4cf409736f3a53016fb8535416b93c0dbf8cac.png") !important; }
div.custom-nvn-dialogue[data-char*="响木天音"] .custom-nvn-portrait-full { content: url("https://origin.picgo.net/2026/09/25/1b0ff70cf6e19f8fa.png") !important; }
div.custom-nvn-dialogue[data-char*="法妮雅"] .custom-nvn-portrait-full { content: url("https://origin.picgo.net/2026/09/25/29f7fcf40b75dde73.png") !important; }
div.custom-nvn-dialogue[data-char*="芙洛蒂"] .custom-nvn-portrait-full { content: url("https://origin.picgo.net/2026/09/25/285955c693bed23c1efd2029b2646423c85fde1138b1617c.png") !important; }
div.custom-nvn-dialogue[data-char*="艾妮希雅"] .custom-nvn-portrait-full { content: url("https://origin.picgo.net/2026/09/25/835a9f2773f0b2b456c0619dbceb2973722d9027b959759a.png") !important; }
div.custom-nvn-dialogue[data-char*="凯拉涅斯"] .custom-nvn-portrait-full { content: url("https://origin.picgo.net/2026/09/25/ed7b112820120595911db8cb66c0af147c44e36ab92dea68.png") !important; }
div.custom-nvn-dialogue[data-char*="赛蕾姆丝"] .custom-nvn-portrait-full { content: url("https://origin.picgo.net/2026/09/25/dc000d04db92fd46d5e1c6fc25b64d727f059ecb23ff1026.png") !important; }
div.custom-nvn-dialogue[data-char*="小忆"] .custom-nvn-portrait-full { content: url("https://origin.picgo.net/2026/09/26/3eca99d0baa472ed543512d23a401e86a6b4c4694736f9cc.png") !important; }
div.custom-nvn-dialogue[data-char*="斯雅"] .custom-nvn-portrait-full { content: url("https://origin.picgo.net/2026/09/26/21646d2441741d1fa.png") !important; }
div.custom-nvn-dialogue[data-char*="蒂莎"] .custom-nvn-portrait-full { content: url("https://origin.picgo.net/2026/09/28/2c6c6c7cf27c5d81571225e875c16eaf61571150c7084731.png") !important; }
div.custom-nvn-dialogue[data-char*="奇诺米"] .custom-nvn-portrait-full { content: url("https://origin.picgo.net/2026/09/28/26681cd9be7ff8260.png") !important; }
div.custom-nvn-dialogue[data-char*="帕特里琪娅"] .custom-nvn-portrait-full { content: url("https://origin.picgo.net/2026/09/28/25a75db1a013fb416d6ab770e08b6c724ea8266c5e5912d4.png") !important; }
div.custom-nvn-dialogue[data-char*="加莉泰娅"] .custom-nvn-portrait-full { content: url("https://origin.picgo.net/2026/09/28/43cdc177a9387cfbf1cac5bea0aa794ac066ff817585f1e8.png") !important; }
div.custom-nvn-dialogue:is([data-char*="盖欧露易丝"], [data-char*="露易丝"]):not([data-char*="王铠"]) .custom-nvn-portrait-full { content: url("https://origin.picgo.net/2026/09/28/60a7b3c7528787365a0b9641693355be4d6a8795fc0d4d41.png") !important; }
div.custom-nvn-dialogue[data-char*="王铠盖欧露易丝"] .custom-nvn-portrait-full { content: url("https://origin.picgo.net/2026/09/28/2f16d8141084e5ead3b6ee85db478024de7e86fc1853bc89.png") !important; }
div.custom-nvn-dialogue[data-char*="古伊奈"]:not([data-char*="王铠"]) .custom-nvn-portrait-full { content: url("https://origin.picgo.net/2026/09/28/b91c910c9dae7659cce6f8d53fabc402a93a48de03844a13.png") !important; }
div.custom-nvn-dialogue[data-char*="王铠古伊奈"] .custom-nvn-portrait-full { content: url("https://origin.picgo.net/2026/09/28/b76f9d6363c6d7cd296c4ec190f40446b3051434372995ff.png") !important; }
div.custom-nvn-dialogue:is([data-char*="斯提亚拉"], [data-char*="提亚拉"]) .custom-nvn-portrait-full { content: url("https://origin.picgo.net/2026/09/28/9d22eb544a59537f2b86e4fa07c4aa1bd16ed95d73ebe063.png") !important; }
div.custom-nvn-dialogue[data-char*="雷克西斯"] .custom-nvn-portrait-full { content: url("https://origin.picgo.net/2026/09/28/94b515d79b47bbd27a34a4b7182512d13936a17a75a1011d.png") !important; }

/* 🌟 本次新角色大图映射 */
div.custom-nvn-dialogue[data-char*="艾尔希"]:not([data-char*="IV"]) .custom-nvn-portrait-full { content: url("https://origin.picgo.net/2026/09/29/da4a4c8d7ddc8a4e10.png") !important; }
div.custom-nvn-dialogue[data-char*="艾尔希IV"] .custom-nvn-portrait-full { content: url("https://origin.picgo.net/2026/09/29/260df9199dd6fb1f0f552e3ffc12105e6d3cace97d3cbdad.png") !important; }
div.custom-nvn-dialogue[data-char*="狄娜"] .custom-nvn-portrait-full { content: url("https://origin.picgo.net/2026/09/29/f762e8ea187a59bd7ff44d653e0cbc73785e9571140b2d72.png") !important; }
div.custom-nvn-dialogue[data-char*="卡莲"] .custom-nvn-portrait-full { content: url("https://origin.picgo.net/2026/09/29/b9b78116e0bfe70bc46b0b4580dbbf038102a23c4e338cc4.png") !important; }
div.custom-nvn-dialogue[data-char*="柯萝特"] .custom-nvn-portrait-full { content: url("https://origin.picgo.net/2026/09/29/b23e3b7d67983d6f31df4d11182ac4a9005289b086f6817f.png") !important; }
div.custom-nvn-dialogue[data-char*="幽妮娅"] .custom-nvn-portrait-full { content: url("https://origin.picgo.net/2026/09/29/lihuifa9005a93c640406.png") !important; }
div.custom-nvn-dialogue[data-char*="托莉娜"]:not([data-char*="魔化"]) .custom-nvn-portrait-full { content: url("https://origin.picgo.net/2026/10/02/61144e7687c3e0fe0ba1946940e64c09032c738028a3f759.png") !important; }
div.custom-nvn-dialogue[data-char*="魔化托莉娜"] .custom-nvn-portrait-full { content: url("https://origin.picgo.net/2026/10/02/f5721a8e9a671b9510b105a3a44059304a6fbb0293e60df2.png") !important; }
div.custom-nvn-dialogue:is([data-char*="一之濑雫"], ) .custom-nvn-portrait-full { content: url("https://origin.picgo.net/2026/10/02/d87fc72aee3455f8114a1ce7ef099ed0df6e35429ab21f77.png") !important; }
/* ====== 移动端自适应 ====== */
@media (max-width: 560px) {
  .custom-nvn-dialogue { gap: 12px; margin: 10px 0 12px; }
  .custom-nvn-avatar-side, .custom-nvn-avatar-img { width: 75px; height: 95px !important; min-height: 95px !important; flex-basis: 75px; border-radius: 12px; }
  .custom-nvn-name-plate { min-height: 32px; padding: 2px 18px 2px 8px; }
  .custom-nvn-rose-crest { width: 18px; height: 18px; }
  .custom-nvn-name-initial { font-size: 1.3em; }
  .custom-nvn-text { padding: 2px 0 2px 12px !important; }
  .custom-nvn-text::before { top: 8px; width: 5px; height: 5px; left: -3.5px; }
  .custom-nvn-motion { padding-left: 12px; font-size: 0.86em; }
  .custom-nvn-avatar-fallback { max-width: 2.2em; font-size: 1.1em; }

  [is_user="true"] .custom-nvn-dialogue .custom-nvn-name-plate,
  .custom-nvn-dialogue:is([data-player^="user"], [data-player="true"]) .custom-nvn-name-plate {
    padding: 2px 8px 2px 18px !important;
  }
  [is_user="true"] .custom-nvn-dialogue .custom-nvn-text,
  .custom-nvn-dialogue:is([data-player^="user"], [data-player="true"]) .custom-nvn-text {
    padding-left: 0 !important;
    padding-right: 12px !important;
  }
  [is_user="true"] .custom-nvn-dialogue .custom-nvn-text::before,
  .custom-nvn-dialogue:is([data-player^="user"], [data-player="true"]) .custom-nvn-text::before {
    right: -3.5px !important;
  }
  [is_user="true"] .custom-nvn-dialogue .custom-nvn-motion,
  .custom-nvn-dialogue:is([data-player^="user"], [data-player="true"]) .custom-nvn-motion {
    padding-right: 12px !important;
  }
}

/* 消除 Markdown 斜体污染 */
.custom-nvn-dialogue em, .custom-nvn-dialogue i,
.custom-nvn-primary em, .custom-nvn-primary i,
.custom-nvn-motion em, .custom-nvn-motion i,
.custom-nvn-text em, .custom-nvn-text i,
.custom-nvn-name-box em, .custom-nvn-name-box i {
  font-style: normal !important;
  font-weight: inherit !important;
  font-size: inherit !important;
  color: inherit !important;
  background: none !important;
  border: none !important;
  letter-spacing: inherit !important;
  text-shadow: inherit !important;
  line-height: inherit !important;
}

/* ⭐ 隐藏空的尾部对话容器 */
.custom-nvn-text-tail:has(.custom-nvn-primary:empty) {
  display: none !important;
}

/* ====== 修复第二段对白变色与双重括号问题 ====== */
.custom-nvn-text-tail .custom-nvn-quote-mark {
  display: inline !important;
}

.custom-nvn-text-tail .custom-nvn-primary,
.custom-nvn-text-tail .custom-nvn-primary * {
  color: var(--stage-text) !important;
  background: transparent !important;
  border: none !important;
  font-family: inherit !important;
  text-shadow: var(--text-shadow-style, none) !important;
}
.custom-nvn-text-tail .custom-nvn-primary * {
  font-size: inherit !important;
}

/* =========================================================================
 * 🎯 BS2 角色专属，保持标准框体大小，背景图微调贴底
 * ========================================================================= */
div.custom-nvn-dialogue:is(
  [data-char*="爱丽丝"], [data-char*="诺登"], [data-char*="小红帽"], [data-char*="普利凯特"],
  [data-char*="梅贝尔"], [data-char*="玛丽·安"], [data-char*="莉耶芙"], [data-char*="公爵夫人"],
  [data-char*="帽子屋"], [data-char*="三月兔"], [data-char*="格里菲"], [data-char*="假海龟"],
  [data-char*="渡渡"], [data-char*="希夏"], [data-char*="比尔"], [data-char*="维多利雅"],
  [data-char*="弗洛伦斯"], [data-char*="罗丽娜"], [data-char*="格尔达"], [data-char*="尤妮丝"],
  [data-char*="莱登"], [data-char*="克缇"], [data-char*="贾巴沃克"], [data-char*="贾布加布"],
  [data-char*="班达斯奈奇"], [data-char*="希伏契"], [data-char*="柴郡猫"], [data-char*="人偶爱丽丝"],
  [data-char*="崔德尔"], [data-char*="雏鸟"], [data-char*="蛇神"]
) .custom-nvn-avatar-img {
  background-size: cover !important;   
  background-position: center 3px !important;       
  transform: none !important;                        
}

/* =========================================================================
 * 星号包裹的「内心思绪」：标签显示 + 引号用 * + 不套心灵感应配色
 * （data-quote="*" 不会命中 [data-quote="〈"] 那批规则，所以文字/名牌/头像
 *   全部走默认配色，和普通行一致）
 * ========================================================================= */
[data-quote="*"] .custom-nvn-quote-mark.custom-left::before { content: "*" !important; }
[data-quote="*"] .custom-nvn-quote-mark.custom-right::before { content: "*" !important; }


/* =========================================================================
 * 🌙 深色主题补齐：摇篮 / 爱丽丝系 角色的专属规则
 * 由浅色主题同源规则搬运，仅覆盖角色配色变量、头像与小头像、大立绘
 * ========================================================================= */

/* ── 角色配色变量 ── */
/* ========================================================================= * 🌟 新增 Black Souls 体系角色专属色彩（四个爱丽丝防撞色微调） * ========================================================================= */ /* ========================================================================= * 🌟 爱丽丝家族【高级白金/浅金系列】（带全量容错与兜底） * ========================================================================= */ /* 0. 兜底保障：只要含有“爱丽丝”均先赋予纯澈月光白金（防止任何情况掉色） */ div.custom-nvn-dialogue[data-char*="爱丽丝"] {--main: #f2d680 !important; --sub: #fffdf5 !important; --rgb: 242, 214, 128 !important; --motion-color: #fae7a8 !important;}
/* ==================== 摇篮（Alice in Cradle） ==================== */ /* 诺艾儿 */ div.custom-nvn-dialogue:is([data-char*="诺艾儿"], [data-char*="诺艾尔"], [data-char*="诺艾儿·柯涅尔"], [data-char*="诺艾尔·柯涅尔"]) {--main: #e6d5a8 !important; --sub: #fbf7ea !important; --rgb: 230, 213, 168 !important; --motion-color: #f0e2be !important;}

/* ── 小头像与表情差分 ── */
div.custom-nvn-dialogue:is([data-char*="诺艾儿"], [data-char*="诺艾尔"], [data-char*="诺艾儿·柯涅尔"], [data-char*="诺艾尔·柯涅尔"]) .custom-nvn-avatar-img {background-image: url("https://origin.picgo.net/2026/10/09/dbf1773e4b140fb5d2b9b87f563b578f0d2610f2c16fcd74.png") !important;}
div.custom-nvn-dialogue:is([data-char*="诺艾儿"], [data-char*="诺艾尔"], [data-char*="诺艾儿·柯涅尔"], [data-char*="诺艾尔·柯涅尔"])[data-action*="脸红"] .custom-nvn-avatar-img {background-image: url("https://origin.picgo.net/2026/10/09/2e21f87da09ae43c0cbb1cea0093c87fe4b3f0dc7d38b17b.png") !important;}
div.custom-nvn-dialogue:is([data-char*="诺艾儿"], [data-char*="诺艾尔"], [data-char*="诺艾儿·柯涅尔"], [data-char*="诺艾尔·柯涅尔"])[data-action="通常"] .custom-nvn-avatar-img {background-image: url("https://origin.picgo.net/2026/10/09/dbf1773e4b140fb5d2b9b87f563b578f0d2610f2c16fcd74.png") !important;}
div.custom-nvn-dialogue:is([data-char*="诺艾儿"], [data-char*="诺艾尔"], [data-char*="诺艾儿·柯涅尔"], [data-char*="诺艾尔·柯涅尔"])[data-action="脸红通常"] .custom-nvn-avatar-img {background-image: url("https://origin.picgo.net/2026/10/09/2e21f87da09ae43c0cbb1cea0093c87fe4b3f0dc7d38b17b.png") !important;}
div.custom-nvn-dialogue:is([data-char*="诺艾儿"], [data-char*="诺艾尔"], [data-char*="诺艾儿·柯涅尔"], [data-char*="诺艾尔·柯涅尔"])[data-action="得意"] .custom-nvn-avatar-img {background-image: url("https://origin.picgo.net/2026/10/09/f4dd1c2b085b65f1f26050cb8b8de846c74625348a25bbb2.png") !important;}
div.custom-nvn-dialogue:is([data-char*="诺艾儿"], [data-char*="诺艾尔"], [data-char*="诺艾儿·柯涅尔"], [data-char*="诺艾尔·柯涅尔"])[data-action="脸红得意"] .custom-nvn-avatar-img {background-image: url("https://origin.picgo.net/2026/10/09/cdfd732f11e1b155951a1c13202abed1485d2b64cef1a223.png") !important;}
div.custom-nvn-dialogue:is([data-char*="诺艾儿"], [data-char*="诺艾尔"], [data-char*="诺艾儿·柯涅尔"], [data-char*="诺艾尔·柯涅尔"])[data-action="腹黑笑"] .custom-nvn-avatar-img {background-image: url("https://origin.picgo.net/2026/10/09/348de2c1f5eb85cb73e77aedf144caa6110a87327a36ff99.png") !important;}
div.custom-nvn-dialogue:is([data-char*="诺艾儿"], [data-char*="诺艾尔"], [data-char*="诺艾儿·柯涅尔"], [data-char*="诺艾尔·柯涅尔"])[data-action="脸红腹黑笑"] .custom-nvn-avatar-img {background-image: url("https://origin.picgo.net/2026/10/09/7633dfeacbef67ba549f71ad09965b7e538808b886f4f4c6.png") !important;}
div.custom-nvn-dialogue:is([data-char*="诺艾儿"], [data-char*="诺艾尔"], [data-char*="诺艾儿·柯涅尔"], [data-char*="诺艾尔·柯涅尔"])[data-action="害羞"] .custom-nvn-avatar-img {background-image: url("https://origin.picgo.net/2026/10/09/eb9421caad13182c5b2c7949b7e046d8391b6a8d136d2cda.png") !important;}
div.custom-nvn-dialogue:is([data-char*="诺艾儿"], [data-char*="诺艾尔"], [data-char*="诺艾儿·柯涅尔"], [data-char*="诺艾尔·柯涅尔"])[data-action="惊讶"] .custom-nvn-avatar-img {background-image: url("https://origin.picgo.net/2026/10/09/49120746356a2d7eda0f3ad651af123e09893a22bcaf0d5d.png") !important;}
div.custom-nvn-dialogue:is([data-char*="诺艾儿"], [data-char*="诺艾尔"], [data-char*="诺艾儿·柯涅尔"], [data-char*="诺艾尔·柯涅尔"])[data-action="脸红惊讶"] .custom-nvn-avatar-img {background-image: url("https://origin.picgo.net/2026/10/09/535755d6d24f190998eefec264b09e95a0d105fed994e5f4.png") !important;}
div.custom-nvn-dialogue:is([data-char*="诺艾儿"], [data-char*="诺艾尔"], [data-char*="诺艾儿·柯涅尔"], [data-char*="诺艾尔·柯涅尔"])[data-action="高兴"] .custom-nvn-avatar-img {background-image: url("https://origin.picgo.net/2026/10/09/0d238c8f045c4941da047614e09ec6a49a4f109eaca6b46c.png") !important;}
div.custom-nvn-dialogue:is([data-char*="诺艾儿"], [data-char*="诺艾尔"], [data-char*="诺艾儿·柯涅尔"], [data-char*="诺艾尔·柯涅尔"])[data-action="脸红高兴"] .custom-nvn-avatar-img {background-image: url("https://origin.picgo.net/2026/10/09/022f2ca9521a15e50f0414db38efc3d43e74df7977ee19b5.png") !important;}
div.custom-nvn-dialogue:is([data-char*="诺艾儿"], [data-char*="诺艾尔"], [data-char*="诺艾儿·柯涅尔"], [data-char*="诺艾尔·柯涅尔"])[data-action="难过"] .custom-nvn-avatar-img {background-image: url("https://origin.picgo.net/2026/10/09/945fcff7deb2dc935fa8a3a7749b549998b7d56f17e0685a.png") !important;}
div.custom-nvn-dialogue:is([data-char*="诺艾儿"], [data-char*="诺艾尔"], [data-char*="诺艾儿·柯涅尔"], [data-char*="诺艾尔·柯涅尔"])[data-action="脸红难过"] .custom-nvn-avatar-img {background-image: url("https://origin.picgo.net/2026/10/09/0bf2cd7750bead49d0480c4960dd018f824818d9de02be69.png") !important;}
div.custom-nvn-dialogue:is([data-char*="诺艾儿"], [data-char*="诺艾尔"], [data-char*="诺艾儿·柯涅尔"], [data-char*="诺艾尔·柯涅尔"])[data-action="疑惑"] .custom-nvn-avatar-img {background-image: url("https://origin.picgo.net/2026/10/09/f732f4719c8eb03c78e18415764bc9b6ba97de2f2e131f83.png") !important;}
div.custom-nvn-dialogue:is([data-char*="诺艾儿"], [data-char*="诺艾尔"], [data-char*="诺艾儿·柯涅尔"], [data-char*="诺艾尔·柯涅尔"])[data-action="脸红疑惑"] .custom-nvn-avatar-img {background-image: url("https://origin.picgo.net/2026/10/09/7648e3d482c734fc18ab8927caed736168cb13f1402a6d7d.png") !important;}
div.custom-nvn-dialogue:is([data-char*="诺艾儿"], [data-char*="诺艾尔"], [data-char*="诺艾儿·柯涅尔"], [data-char*="诺艾尔·柯涅尔"])[data-action="生气"] .custom-nvn-avatar-img {background-image: url("https://origin.picgo.net/2026/10/09/81b2795e32c858283ad83d941dd8465af367762d67f71b0f.png") !important;}
div.custom-nvn-dialogue:is([data-char*="诺艾儿"], [data-char*="诺艾尔"], [data-char*="诺艾儿·柯涅尔"], [data-char*="诺艾尔·柯涅尔"])[data-action="脸红生气"] .custom-nvn-avatar-img {background-image: url("https://origin.picgo.net/2026/10/09/614649e0edee1d349725d6fc9d7fefc69315448936ece6ad.png") !important;}
div.custom-nvn-dialogue:is([data-char*="诺艾儿"], [data-char*="诺艾尔"], [data-char*="诺艾儿·柯涅尔"], [data-char*="诺艾尔·柯涅尔"])[data-action="皱眉"] .custom-nvn-avatar-img {background-image: url("https://origin.picgo.net/2026/10/09/a154d861bca7a87f53453c13c9943095363db956a70586d9.png") !important;}
div.custom-nvn-dialogue:is([data-char*="诺艾儿"], [data-char*="诺艾尔"], [data-char*="诺艾儿·柯涅尔"], [data-char*="诺艾尔·柯涅尔"])[data-action="脸红皱眉"] .custom-nvn-avatar-img {background-image: url("https://origin.picgo.net/2026/10/09/8b9a6b341cff9582779d249eb943474f62d54bddc38b3a0a.png") !important;}
div.custom-nvn-dialogue:is([data-char*="诺艾儿"], [data-char*="诺艾尔"], [data-char*="诺艾儿·柯涅尔"], [data-char*="诺艾尔·柯涅尔"])[data-action="思考"] .custom-nvn-avatar-img {background-image: url("https://origin.picgo.net/2026/10/09/86e1b1277e616f4555a496475822a01fb620dd006d1d8c2a.png") !important;}
div.custom-nvn-dialogue:is([data-char*="诺艾儿"], [data-char*="诺艾尔"], [data-char*="诺艾儿·柯涅尔"], [data-char*="诺艾尔·柯涅尔"])[data-action="脸红思考"] .custom-nvn-avatar-img {background-image: url("https://origin.picgo.net/2026/10/09/a603afab8981e1ab77cd48b9152b5985eed0d204292aa09d.png") !important;}

/* ── 大立绘 ── */
div.custom-nvn-dialogue:is([data-char*="诺艾儿"], [data-char*="诺艾尔"], [data-char*="诺艾儿·柯涅尔"], [data-char*="诺艾尔·柯涅尔"]) .custom-nvn-portrait-full {content: url("https://origin.picgo.net/2026/10/09/2a22d924594f08f05215076841ae8b9f44eb2f199514ad4b.png") !important;}

/* ── 角色配色变量 ── */
/* 诺艾尔·私 */ div.custom-nvn-dialogue:is([data-char*="诺艾尔·私"], [data-char*="诺艾儿·私"]) {--main: #e6d5a8 !important; --sub: #fbf7ea !important; --rgb: 230, 213, 168 !important; --motion-color: #f0e2be !important;}

/* ── 小头像与表情差分 ── */
div.custom-nvn-dialogue:is([data-char*="诺艾尔·私"], [data-char*="诺艾儿·私"]) .custom-nvn-avatar-img {background-image: url("https://origin.picgo.net/2026/10/09/1c44cfef5136c78c62c1c410c12e440bfb41f653c8d369ed.png") !important;}
div.custom-nvn-dialogue:is([data-char*="诺艾尔·私"], [data-char*="诺艾儿·私"])[data-action*="脸红"] .custom-nvn-avatar-img {background-image: url("https://origin.picgo.net/2026/10/09/e72b3031828d9b6035b15f59e49caf6e1a157adeed979d84.png") !important;}
div.custom-nvn-dialogue:is([data-char*="诺艾尔·私"], [data-char*="诺艾儿·私"])[data-action="通常"] .custom-nvn-avatar-img {background-image: url("https://origin.picgo.net/2026/10/09/1c44cfef5136c78c62c1c410c12e440bfb41f653c8d369ed.png") !important;}
div.custom-nvn-dialogue:is([data-char*="诺艾尔·私"], [data-char*="诺艾儿·私"])[data-action="脸红通常"] .custom-nvn-avatar-img {background-image: url("https://origin.picgo.net/2026/10/09/e72b3031828d9b6035b15f59e49caf6e1a157adeed979d84.png") !important;}
div.custom-nvn-dialogue:is([data-char*="诺艾尔·私"], [data-char*="诺艾儿·私"])[data-action="得意"] .custom-nvn-avatar-img {background-image: url("https://origin.picgo.net/2026/10/09/ba66699aebbd252824cd88dcdcbf3f2dfa04ccf3f376e7e2.png") !important;}
div.custom-nvn-dialogue:is([data-char*="诺艾尔·私"], [data-char*="诺艾儿·私"])[data-action="脸红得意"] .custom-nvn-avatar-img {background-image: url("https://origin.picgo.net/2026/10/09/5cfd4a82dc71cfa408092d2cf235bfe06786b10c6c26e9d6.png") !important;}
div.custom-nvn-dialogue:is([data-char*="诺艾尔·私"], [data-char*="诺艾儿·私"])[data-action="腹黑笑"] .custom-nvn-avatar-img {background-image: url("https://origin.picgo.net/2026/10/09/a2b9424b8df7431d201750b8b0fd4fbc5ee9dbc00f0dbd35.png") !important;}
div.custom-nvn-dialogue:is([data-char*="诺艾尔·私"], [data-char*="诺艾儿·私"])[data-action="脸红腹黑笑"] .custom-nvn-avatar-img {background-image: url("https://origin.picgo.net/2026/10/09/15b2202f0d959358499497d63a5e44947e572ef80252b601.png") !important;}
div.custom-nvn-dialogue:is([data-char*="诺艾尔·私"], [data-char*="诺艾儿·私"])[data-action="害羞"] .custom-nvn-avatar-img {background-image: url("https://origin.picgo.net/2026/10/09/891266c055a5b6a1fd945a161e89e8858b524ad945d1513b.png") !important;}
div.custom-nvn-dialogue:is([data-char*="诺艾尔·私"], [data-char*="诺艾儿·私"])[data-action="惊讶"] .custom-nvn-avatar-img {background-image: url("https://origin.picgo.net/2026/10/09/9674544bbcbccd20fdd7a33a0e14d1a2e96f67b87144f0bf.png") !important;}
div.custom-nvn-dialogue:is([data-char*="诺艾尔·私"], [data-char*="诺艾儿·私"])[data-action="脸红惊讶"] .custom-nvn-avatar-img {background-image: url("https://origin.picgo.net/2026/10/09/b5fc34e317db98e9fa5d7f759ab911aaa85cd330d8a8f1ad.png") !important;}
div.custom-nvn-dialogue:is([data-char*="诺艾尔·私"], [data-char*="诺艾儿·私"])[data-action="高兴"] .custom-nvn-avatar-img {background-image: url("https://origin.picgo.net/2026/10/09/1c44cfef5136c78c62c1c410c12e440bfb41f653c8d369ed.png") !important;}
div.custom-nvn-dialogue:is([data-char*="诺艾尔·私"], [data-char*="诺艾儿·私"])[data-action="脸红高兴"] .custom-nvn-avatar-img {background-image: url("https://origin.picgo.net/2026/10/09/e72b3031828d9b6035b15f59e49caf6e1a157adeed979d84.png") !important;}
div.custom-nvn-dialogue:is([data-char*="诺艾尔·私"], [data-char*="诺艾儿·私"])[data-action="难过"] .custom-nvn-avatar-img {background-image: url("https://origin.picgo.net/2026/10/09/eacb914c7244a08bb063b5b0b0b63f4f8e089243bb9e9174.png") !important;}
div.custom-nvn-dialogue:is([data-char*="诺艾尔·私"], [data-char*="诺艾儿·私"])[data-action="脸红难过"] .custom-nvn-avatar-img {background-image: url("https://origin.picgo.net/2026/10/09/dd5380cf576e93bd883a8e719b3416a592a73e9447b9ff1a.png") !important;}
div.custom-nvn-dialogue:is([data-char*="诺艾尔·私"], [data-char*="诺艾儿·私"])[data-action="疑惑"] .custom-nvn-avatar-img {background-image: url("https://origin.picgo.net/2026/10/09/30f4f204590c64b512a973b9a1ed167157057c30bc7640b2.png") !important;}
div.custom-nvn-dialogue:is([data-char*="诺艾尔·私"], [data-char*="诺艾儿·私"])[data-action="脸红疑惑"] .custom-nvn-avatar-img {background-image: url("https://origin.picgo.net/2026/10/09/eda5a586797030c4789da819721ed6b37b9fb5944ae10ac5.png") !important;}
div.custom-nvn-dialogue:is([data-char*="诺艾尔·私"], [data-char*="诺艾儿·私"])[data-action="生气"] .custom-nvn-avatar-img {background-image: url("https://origin.picgo.net/2026/10/09/91b3bd8fe07b450a051021a6d177aad762dbe43693e8fc4b.png") !important;}
div.custom-nvn-dialogue:is([data-char*="诺艾尔·私"], [data-char*="诺艾儿·私"])[data-action="脸红生气"] .custom-nvn-avatar-img {background-image: url("https://origin.picgo.net/2026/10/09/61f6460dae961750dcb0038dc64a4dad838b0c3c78345011.png") !important;}
div.custom-nvn-dialogue:is([data-char*="诺艾尔·私"], [data-char*="诺艾儿·私"])[data-action="皱眉"] .custom-nvn-avatar-img {background-image: url("https://origin.picgo.net/2026/10/09/d60e247fdf51ceaf6f2a1f6f7437f3d1b29f4f3778fd3948.png") !important;}
div.custom-nvn-dialogue:is([data-char*="诺艾尔·私"], [data-char*="诺艾儿·私"])[data-action="脸红皱眉"] .custom-nvn-avatar-img {background-image: url("https://origin.picgo.net/2026/10/09/312f4eb93abed942a0ee9c4f912f53fb61267a05b80173ad.png") !important;}
div.custom-nvn-dialogue:is([data-char*="诺艾尔·私"], [data-char*="诺艾儿·私"])[data-action="思考"] .custom-nvn-avatar-img {background-image: url("https://origin.picgo.net/2026/10/09/909b5947f95c6001c1ed5926de5069678bfc88ed97096912.png") !important;}
div.custom-nvn-dialogue:is([data-char*="诺艾尔·私"], [data-char*="诺艾儿·私"])[data-action="脸红思考"] .custom-nvn-avatar-img {background-image: url("https://origin.picgo.net/2026/10/09/4fd41183ff2a376e4411a9da1674999e84a4ff4ebae7f4bf.png") !important;}

/* ── 大立绘 ── */
div.custom-nvn-dialogue:is([data-char*="诺艾尔·私"], [data-char*="诺艾儿·私"]) .custom-nvn-portrait-full {content: url("https://origin.picgo.net/2026/10/09/7227ffec17576c98216dd48037335cec70414d3e4f654b6f.png") !important;}

/* ── 角色配色变量 ── */
/* 爱莉丝 */ div.custom-nvn-dialogue:is([data-char*="爱莉丝"], [data-char*="摇篮的爱莉丝"]) {--main: #f0a3c0 !important; --sub: #fdeef5 !important; --rgb: 240, 163, 192 !important; --motion-color: #f7bcd2 !important;}

/* ── 小头像与表情差分 ── */
div.custom-nvn-dialogue:is([data-char*="爱莉丝"], [data-char*="摇篮的爱莉丝"]) .custom-nvn-avatar-img {background-image: url("https://origin.picgo.net/2026/10/09/e7358a0e690ac9ee8d3aa49c800ee009bfb40ef3e2806f70.png") !important;}
div.custom-nvn-dialogue:is([data-char*="爱莉丝"], [data-char*="摇篮的爱莉丝"])[data-action*="脸红"] .custom-nvn-avatar-img {background-image: url("https://origin.picgo.net/2026/10/09/ce733e88732ac801bb359d3e04ea67669ade161be2241b71.png") !important;}
div.custom-nvn-dialogue:is([data-char*="爱莉丝"], [data-char*="摇篮的爱莉丝"])[data-action="通常"] .custom-nvn-avatar-img {background-image: url("https://origin.picgo.net/2026/10/09/e7358a0e690ac9ee8d3aa49c800ee009bfb40ef3e2806f70.png") !important;}
div.custom-nvn-dialogue:is([data-char*="爱莉丝"], [data-char*="摇篮的爱莉丝"])[data-action="脸红通常"] .custom-nvn-avatar-img {background-image: url("https://origin.picgo.net/2026/10/09/ce733e88732ac801bb359d3e04ea67669ade161be2241b71.png") !important;}
div.custom-nvn-dialogue:is([data-char*="爱莉丝"], [data-char*="摇篮的爱莉丝"])[data-action="得意"] .custom-nvn-avatar-img {background-image: url("https://origin.picgo.net/2026/10/09/95bc1cdbfa9668db2fbc8dc06298a33bcb785f4a017d8b06.png") !important;}
div.custom-nvn-dialogue:is([data-char*="爱莉丝"], [data-char*="摇篮的爱莉丝"])[data-action="脸红得意"] .custom-nvn-avatar-img {background-image: url("https://origin.picgo.net/2026/10/09/6cc74a3827b2868251f471906893d0447b10980b035a1ff1.png") !important;}
div.custom-nvn-dialogue:is([data-char*="爱莉丝"], [data-char*="摇篮的爱莉丝"])[data-action="腹黑笑"] .custom-nvn-avatar-img {background-image: url("https://origin.picgo.net/2026/10/09/474a66c78a185da649816aa195d2721975e278cbaa478157.png") !important;}
div.custom-nvn-dialogue:is([data-char*="爱莉丝"], [data-char*="摇篮的爱莉丝"])[data-action="脸红腹黑笑"] .custom-nvn-avatar-img {background-image: url("https://origin.picgo.net/2026/10/09/e662725f3b4761ca21fef1ca09745e43728488d4cd99b287.png") !important;}
div.custom-nvn-dialogue:is([data-char*="爱莉丝"], [data-char*="摇篮的爱莉丝"])[data-action="害羞"] .custom-nvn-avatar-img {background-image: url("https://origin.picgo.net/2026/10/09/219ede39b673002d5e0cc81e0dcf911f1383408311f9281c.png") !important;}
div.custom-nvn-dialogue:is([data-char*="爱莉丝"], [data-char*="摇篮的爱莉丝"])[data-action="惊讶"] .custom-nvn-avatar-img {background-image: url("https://origin.picgo.net/2026/10/09/61e8cfe22667c2a134f1f154b0abc08c89ef5ff2ecf4e089.png") !important;}
div.custom-nvn-dialogue:is([data-char*="爱莉丝"], [data-char*="摇篮的爱莉丝"])[data-action="脸红惊讶"] .custom-nvn-avatar-img {background-image: url("https://origin.picgo.net/2026/10/09/b421f39fb65f386a7e4e4a04d0ef5014ca95dfc72700d142.png") !important;}
div.custom-nvn-dialogue:is([data-char*="爱莉丝"], [data-char*="摇篮的爱莉丝"])[data-action="高兴"] .custom-nvn-avatar-img {background-image: url("https://origin.picgo.net/2026/10/09/30cd68f371ae7e82d1f023ff77bbd5fcf669e82f16a6db0f.png") !important;}
div.custom-nvn-dialogue:is([data-char*="爱莉丝"], [data-char*="摇篮的爱莉丝"])[data-action="脸红高兴"] .custom-nvn-avatar-img {background-image: url("https://origin.picgo.net/2026/10/09/219ede39b673002d5e0cc81e0dcf911f1383408311f9281c.png") !important;}
div.custom-nvn-dialogue:is([data-char*="爱莉丝"], [data-char*="摇篮的爱莉丝"])[data-action="难过"] .custom-nvn-avatar-img {background-image: url("https://origin.picgo.net/2026/10/09/92aaf3b3476639523d8d7c59b512ed8d70aa835f79fd8999.png") !important;}
div.custom-nvn-dialogue:is([data-char*="爱莉丝"], [data-char*="摇篮的爱莉丝"])[data-action="脸红难过"] .custom-nvn-avatar-img {background-image: url("https://origin.picgo.net/2026/10/09/eb4937ed6a352d2d3db35806a734fc147578f4e70988a7d2.png") !important;}
div.custom-nvn-dialogue:is([data-char*="爱莉丝"], [data-char*="摇篮的爱莉丝"])[data-action="疑惑"] .custom-nvn-avatar-img {background-image: url("https://origin.picgo.net/2026/10/09/901d6472c99ff552c02cb737dd8663126fd8b89ef20e079a.png") !important;}
div.custom-nvn-dialogue:is([data-char*="爱莉丝"], [data-char*="摇篮的爱莉丝"])[data-action="脸红疑惑"] .custom-nvn-avatar-img {background-image: url("https://origin.picgo.net/2026/10/09/437476fa2160b6f578c88b04fe56843ed4a85c8df7ccb5a1.png") !important;}
div.custom-nvn-dialogue:is([data-char*="爱莉丝"], [data-char*="摇篮的爱莉丝"])[data-action="生气"] .custom-nvn-avatar-img {background-image: url("https://origin.picgo.net/2026/10/09/0cc63fed6f082fdbed7d87f697cd6e29085c28cea551c835.png") !important;}
div.custom-nvn-dialogue:is([data-char*="爱莉丝"], [data-char*="摇篮的爱莉丝"])[data-action="脸红生气"] .custom-nvn-avatar-img {background-image: url("https://origin.picgo.net/2026/10/09/71de764c60a2f57030b1f78578b6bfea6f0f3df4c149e780.png") !important;}
div.custom-nvn-dialogue:is([data-char*="爱莉丝"], [data-char*="摇篮的爱莉丝"])[data-action="皱眉"] .custom-nvn-avatar-img {background-image: url("https://origin.picgo.net/2026/10/09/0b48d9f3e564e241213b80f4f2909e365c6a63e0c1f0a66c.png") !important;}
div.custom-nvn-dialogue:is([data-char*="爱莉丝"], [data-char*="摇篮的爱莉丝"])[data-action="脸红皱眉"] .custom-nvn-avatar-img {background-image: url("https://origin.picgo.net/2026/10/09/b2bdd9bf9ce566415d7f81322e766747e4a23167fc985bcb.png") !important;}
div.custom-nvn-dialogue:is([data-char*="爱莉丝"], [data-char*="摇篮的爱莉丝"])[data-action="思考"] .custom-nvn-avatar-img {background-image: url("https://origin.picgo.net/2026/10/09/f50eb2de8df39d4ade8a4ffad1176f72c83025e0d5fc6ecc.png") !important;}
div.custom-nvn-dialogue:is([data-char*="爱莉丝"], [data-char*="摇篮的爱莉丝"])[data-action="脸红思考"] .custom-nvn-avatar-img {background-image: url("https://origin.picgo.net/2026/10/09/4f7cb26816c02256e102f107ab97c81dc64adbfec56456a1.png") !important;}

/* ── 大立绘 ── */
div.custom-nvn-dialogue:is([data-char*="爱莉丝"], [data-char*="摇篮的爱莉丝"]) .custom-nvn-portrait-full {content: url("https://origin.picgo.net/2026/10/09/4f51b65c3e1ac30bd35c65c5556a3c12460f6d9382a5558c.png") !important;}

/* ── 角色配色变量 ── */
/* 丽薇歌塔 */ div.custom-nvn-dialogue:is([data-char*="丽薇歌塔"], [data-char*="丽薇歌塔·柯涅尔"]) {--main: #a3c8ea !important; --sub: #eef6fd !important; --rgb: 163, 200, 234 !important; --motion-color: #bcd8f2 !important;}

/* ── 小头像与表情差分 ── */
div.custom-nvn-dialogue:is([data-char*="丽薇歌塔"], [data-char*="丽薇歌塔·柯涅尔"]) .custom-nvn-avatar-img {background-image: url("https://origin.picgo.net/2026/10/09/a8b107fdee3322ceaf8a60dd7a8e44f1a5400ba8a91b5357.png") !important;}
div.custom-nvn-dialogue:is([data-char*="丽薇歌塔"], [data-char*="丽薇歌塔·柯涅尔"])[data-action*="脸红"] .custom-nvn-avatar-img {background-image: url("https://origin.picgo.net/2026/10/09/a8b107fdee3322ceaf8a60dd7a8e44f1a5400ba8a91b5357.png") !important;}
div.custom-nvn-dialogue:is([data-char*="丽薇歌塔"], [data-char*="丽薇歌塔·柯涅尔"])[data-action="脸红通常"] .custom-nvn-avatar-img {background-image: url("https://origin.picgo.net/2026/10/09/a8b107fdee3322ceaf8a60dd7a8e44f1a5400ba8a91b5357.png") !important;}
div.custom-nvn-dialogue:is([data-char*="丽薇歌塔"], [data-char*="丽薇歌塔·柯涅尔"])[data-action="得意"] .custom-nvn-avatar-img {background-image: url("https://origin.picgo.net/2026/10/09/c39089b1c7a9c730d052dd0a68a52cd493dcc42c301e733e.png") !important;}
div.custom-nvn-dialogue:is([data-char*="丽薇歌塔"], [data-char*="丽薇歌塔·柯涅尔"])[data-action="高兴"] .custom-nvn-avatar-img {background-image: url("https://origin.picgo.net/2026/10/09/5c5fe0cf2d5881e458161c5f76d6fc3eeafc7e64af17240f.png") !important;}
div.custom-nvn-dialogue:is([data-char*="丽薇歌塔"], [data-char*="丽薇歌塔·柯涅尔"])[data-action="脸红高兴"] .custom-nvn-avatar-img {background-image: url("https://origin.picgo.net/2026/10/09/1675a5403da89143dd693de27d6d510afb9c0a1bab0dfa5d.png") !important;}
div.custom-nvn-dialogue:is([data-char*="丽薇歌塔"], [data-char*="丽薇歌塔·柯涅尔"])[data-action="难过"] .custom-nvn-avatar-img {background-image: url("https://origin.picgo.net/2026/10/09/07a75162b7b5495a03977f9271acc8185b215b9a0424188f.png") !important;}
div.custom-nvn-dialogue:is([data-char*="丽薇歌塔"], [data-char*="丽薇歌塔·柯涅尔"])[data-action="脸红难过"] .custom-nvn-avatar-img {background-image: url("https://origin.picgo.net/2026/10/09/336dc29d4e818565fed9e783dab3292ffaa800abf3b4da6a.png") !important;}
div.custom-nvn-dialogue:is([data-char*="丽薇歌塔"], [data-char*="丽薇歌塔·柯涅尔"])[data-action="疑惑"] .custom-nvn-avatar-img {background-image: url("https://origin.picgo.net/2026/10/09/565951c73ea45efae68f01ede332cf22a3807f5f19f3cd12.png") !important;}
div.custom-nvn-dialogue:is([data-char*="丽薇歌塔"], [data-char*="丽薇歌塔·柯涅尔"])[data-action="脸红疑惑"] .custom-nvn-avatar-img {background-image: url("https://origin.picgo.net/2026/10/09/a286806d8297492edb5299bfa377b09aedbe8d5099adb126.png") !important;}
div.custom-nvn-dialogue:is([data-char*="丽薇歌塔"], [data-char*="丽薇歌塔·柯涅尔"])[data-action="生气"] .custom-nvn-avatar-img {background-image: url("https://origin.picgo.net/2026/10/09/dd50cf2d80de88db794e1861182d6cb77198ddb661724a03.png") !important;}
div.custom-nvn-dialogue:is([data-char*="丽薇歌塔"], [data-char*="丽薇歌塔·柯涅尔"])[data-action="脸红生气"] .custom-nvn-avatar-img {background-image: url("https://origin.picgo.net/2026/10/09/91e36c2efd26e388b71c4015caf7725255c06de0225ca4f5.png") !important;}
div.custom-nvn-dialogue:is([data-char*="丽薇歌塔"], [data-char*="丽薇歌塔·柯涅尔"])[data-action="思考"] .custom-nvn-avatar-img {background-image: url("https://origin.picgo.net/2026/10/09/c2cb621bde4179bb71bc120233802f97948c1ee11d85b158.png") !important;}
div.custom-nvn-dialogue:is([data-char*="丽薇歌塔"], [data-char*="丽薇歌塔·柯涅尔"])[data-action="脸红思考"] .custom-nvn-avatar-img {background-image: url("https://origin.picgo.net/2026/10/09/35268692abf3f6a61dea00d4473dae3717cd1d81c352e662.png") !important;}

/* ── 大立绘 ── */
div.custom-nvn-dialogue:is([data-char*="丽薇歌塔"], [data-char*="丽薇歌塔·柯涅尔"]) .custom-nvn-portrait-full {content: url("https://origin.picgo.net/2026/10/09/a8d19917fdf30ec250e7e8a11a42a48da380fe3803d7e02d.png") !important;}

/* ── 角色配色变量 ── */
/* 伊夏 */ div.custom-nvn-dialogue:is([data-char*="伊夏"], [data-char*="伊夏·波利斯塔切尔"]) {--main: #a3d9b0 !important; --sub: #eefaf1 !important; --rgb: 163, 217, 176 !important; --motion-color: #bce6c6 !important;}

/* ── 小头像与表情差分 ── */
div.custom-nvn-dialogue:is([data-char*="伊夏"], [data-char*="伊夏·波利斯塔切尔"]) .custom-nvn-avatar-img {background-image: url("https://origin.picgo.net/2026/10/09/8a92daf62cb0dbefd47c13369d2a3723f1fa038f9a0f6fe0.png") !important;}
div.custom-nvn-dialogue:is([data-char*="伊夏"], [data-char*="伊夏·波利斯塔切尔"])[data-action*="脸红"] .custom-nvn-avatar-img {background-image: url("https://origin.picgo.net/2026/10/09/561c1caf6da430312eabbe0d47262b93ae260508df542d62.png") !important;}
div.custom-nvn-dialogue:is([data-char*="伊夏"], [data-char*="伊夏·波利斯塔切尔"])[data-action="通常"] .custom-nvn-avatar-img {background-image: url("https://origin.picgo.net/2026/10/09/8a92daf62cb0dbefd47c13369d2a3723f1fa038f9a0f6fe0.png") !important;}
div.custom-nvn-dialogue:is([data-char*="伊夏"], [data-char*="伊夏·波利斯塔切尔"])[data-action="脸红通常"] .custom-nvn-avatar-img {background-image: url("https://origin.picgo.net/2026/10/09/561c1caf6da430312eabbe0d47262b93ae260508df542d62.png") !important;}
div.custom-nvn-dialogue:is([data-char*="伊夏"], [data-char*="伊夏·波利斯塔切尔"])[data-action="得意"] .custom-nvn-avatar-img {background-image: url("https://origin.picgo.net/2026/10/09/717b67674f1b47449cf26f66063517f071af9533d49c5cee.png") !important;}
div.custom-nvn-dialogue:is([data-char*="伊夏"], [data-char*="伊夏·波利斯塔切尔"])[data-action="脸红得意"] .custom-nvn-avatar-img {background-image: url("https://origin.picgo.net/2026/10/09/4022c9d438645db6d1a76523c126b50f8dbfd2fe74641f65.png") !important;}
div.custom-nvn-dialogue:is([data-char*="伊夏"], [data-char*="伊夏·波利斯塔切尔"])[data-action="腹黑笑"] .custom-nvn-avatar-img {background-image: url("https://origin.picgo.net/2026/10/09/1192afc57a98ef010c42b32fd5c1cc291c93314e6fe0e35b.png") !important;}
div.custom-nvn-dialogue:is([data-char*="伊夏"], [data-char*="伊夏·波利斯塔切尔"])[data-action="脸红腹黑笑"] .custom-nvn-avatar-img {background-image: url("https://origin.picgo.net/2026/10/09/6874e2746890bc5711de1fc434c5848effabd5dde880a1a7.png") !important;}
div.custom-nvn-dialogue:is([data-char*="伊夏"], [data-char*="伊夏·波利斯塔切尔"])[data-action="害羞"] .custom-nvn-avatar-img {background-image: url("https://origin.picgo.net/2026/10/09/4e281341a5f0d8e3dbf67dff827e875988cce629bad291aa.png") !important;}
div.custom-nvn-dialogue:is([data-char*="伊夏"], [data-char*="伊夏·波利斯塔切尔"])[data-action="惊讶"] .custom-nvn-avatar-img {background-image: url("https://origin.picgo.net/2026/10/09/52c5273ac136a3f7042846b1bade6e0940c9150d385cb294.png") !important;}
div.custom-nvn-dialogue:is([data-char*="伊夏"], [data-char*="伊夏·波利斯塔切尔"])[data-action="脸红惊讶"] .custom-nvn-avatar-img {background-image: url("https://origin.picgo.net/2026/10/09/840a52689f59550208b7cc86e0a9832b328e624f7e0d5b9b.png") !important;}
div.custom-nvn-dialogue:is([data-char*="伊夏"], [data-char*="伊夏·波利斯塔切尔"])[data-action="高兴"] .custom-nvn-avatar-img {background-image: url("https://origin.picgo.net/2026/10/09/f381ea13054cebdd6743acc0afd7e609f4676614746704c4.png") !important;}
div.custom-nvn-dialogue:is([data-char*="伊夏"], [data-char*="伊夏·波利斯塔切尔"])[data-action="脸红高兴"] .custom-nvn-avatar-img {background-image: url("https://origin.picgo.net/2026/10/09/9a09778293405afef169392f11cd380366cd16cb4f4b330f.png") !important;}
div.custom-nvn-dialogue:is([data-char*="伊夏"], [data-char*="伊夏·波利斯塔切尔"])[data-action="难过"] .custom-nvn-avatar-img {background-image: url("https://origin.picgo.net/2026/10/09/a24c2d5f9f935f56853def9455586f03ff0cb4286cbfbb0a.png") !important;}
div.custom-nvn-dialogue:is([data-char*="伊夏"], [data-char*="伊夏·波利斯塔切尔"])[data-action="脸红难过"] .custom-nvn-avatar-img {background-image: url("https://origin.picgo.net/2026/10/09/8810f5154dd8b8f2496256f73c250fd724471c0a6a2fbcb9.png") !important;}
div.custom-nvn-dialogue:is([data-char*="伊夏"], [data-char*="伊夏·波利斯塔切尔"])[data-action="疑惑"] .custom-nvn-avatar-img {background-image: url("https://origin.picgo.net/2026/10/09/0ef748a58d80ef45d9b1d18ac071f3fd21b1cda8467bd1a1.png") !important;}
div.custom-nvn-dialogue:is([data-char*="伊夏"], [data-char*="伊夏·波利斯塔切尔"])[data-action="脸红疑惑"] .custom-nvn-avatar-img {background-image: url("https://origin.picgo.net/2026/10/09/064684554bcac177d700b63572cac522ff8f77dbf7baa29a.png") !important;}
div.custom-nvn-dialogue:is([data-char*="伊夏"], [data-char*="伊夏·波利斯塔切尔"])[data-action="生气"] .custom-nvn-avatar-img {background-image: url("https://origin.picgo.net/2026/10/09/a8306a5be6d42d7a1a5bafaf5f436c0d6338a5d49df9ebde.png") !important;}
div.custom-nvn-dialogue:is([data-char*="伊夏"], [data-char*="伊夏·波利斯塔切尔"])[data-action="脸红生气"] .custom-nvn-avatar-img {background-image: url("https://origin.picgo.net/2026/10/09/876283f3d02906e7e83e5ed01275ee44609dc3802d1cbdc9.png") !important;}
div.custom-nvn-dialogue:is([data-char*="伊夏"], [data-char*="伊夏·波利斯塔切尔"])[data-action="思考"] .custom-nvn-avatar-img {background-image: url("https://origin.picgo.net/2026/10/09/51be9720b948143a31ff1a1db85c33befc834193d22ecfaa.png") !important;}
div.custom-nvn-dialogue:is([data-char*="伊夏"], [data-char*="伊夏·波利斯塔切尔"])[data-action="脸红思考"] .custom-nvn-avatar-img {background-image: url("https://origin.picgo.net/2026/10/09/20fccf88515ce79b1c9d44373d165eb0d81b7794b9da6b08.png") !important;}

/* ── 大立绘 ── */
div.custom-nvn-dialogue:is([data-char*="伊夏"], [data-char*="伊夏·波利斯塔切尔"]) .custom-nvn-portrait-full {content: url("https://origin.picgo.net/2026/10/09/10b2aca97763eb3a49f8128a9814beb2c5481bd280ca3c43.png") !important;}

/* ── 角色配色变量 ── */
/* 普莉姆拉 */ div.custom-nvn-dialogue[data-char*="普莉姆拉"] {--main: #f0b48a !important; --sub: #fdf2ea !important; --rgb: 240, 180, 138 !important; --motion-color: #f5cbab !important;}

/* ── 小头像与表情差分 ── */
div.custom-nvn-dialogue[data-char*="普莉姆拉"] .custom-nvn-avatar-img {background-image: url("https://origin.picgo.net/2026/10/09/f7f280b17e6d7805d7897ba696a1e20d3b8f10b29e9d8c94.png") !important;}

/* ── 大立绘 ── */
div.custom-nvn-dialogue[data-char*="普莉姆拉"] .custom-nvn-portrait-full {content: url("https://origin.picgo.net/2026/10/09/884cc922fd1904e67993d69e7d3445d5dffde6651ddc6375.png") !important;}

/* ── 角色配色变量 ── */
/* 蒂格蕾娜 */ div.custom-nvn-dialogue:is([data-char*="蒂格蕾娜"], [data-char*="蒂格蕾娜·索菈"]) {--main: #b8a3e0 !important; --sub: #f4f0fd !important; --rgb: 184, 163, 224 !important; --motion-color: #cdbdef !important;}

/* ── 小头像与表情差分 ── */
div.custom-nvn-dialogue:is([data-char*="蒂格蕾娜"], [data-char*="蒂格蕾娜·索菈"]) .custom-nvn-avatar-img {background-image: url("https://origin.picgo.net/2026/10/09/2ec536e01e4a1d8fa5e03a3d0108a67f6fbb29064719cdbf.png") !important;}

/* ── 角色配色变量 ── */
/* 阿尔玛 */ div.custom-nvn-dialogue:is([data-char*="阿尔玛"], [data-char*="阿尔玛·奥普菲帕姆"]) {--main: #8fae8f !important; --sub: #f0f6f0 !important; --rgb: 143, 174, 143 !important; --motion-color: #a9c2a9 !important;}

/* ── 小头像与表情差分 ── */
div.custom-nvn-dialogue:is([data-char*="阿尔玛"], [data-char*="阿尔玛·奥普菲帕姆"]) .custom-nvn-avatar-img {background-image: url("https://origin.picgo.net/2026/10/09/c198a204eee2c132480f921abc2d8ef9a3e0f3b392fc4390.png") !important;}

/* ── 大立绘 ── */
div.custom-nvn-dialogue:is([data-char*="阿尔玛"], [data-char*="阿尔玛·奥普菲帕姆"]) .custom-nvn-portrait-full {content: url("https://origin.picgo.net/2026/10/09/228295f011fe1684404359630b437c4b25a11bf8ad3f0d13.png") !important;}

/* ── 角色配色变量 ── */
/* 提尔德 */ div.custom-nvn-dialogue:is([data-char*="提尔德"], [data-char*="提尔德·柯涅尔"]) {--main: #a8d8d8 !important; --sub: #effafa !important; --rgb: 168, 216, 216 !important; --motion-color: #c0e6e6 !important;}

/* ── 小头像与表情差分 ── */
div.custom-nvn-dialogue:is([data-char*="提尔德"], [data-char*="提尔德·柯涅尔"]) .custom-nvn-avatar-img {background-image: url("https://origin.picgo.net/2026/10/09/2b6b1e8136d25067d2ea66a8009867006d68b43a8642b5ba.png") !important;}

/* ── 角色配色变量 ── */
/* 德尔菲尼 */ div.custom-nvn-dialogue:is([data-char*="德尔菲尼"], [data-char*="德尔菲尼·柯涅尔"]) {--main: #9aae9a !important; --sub: #f1f6f1 !important; --rgb: 154, 174, 154 !important; --motion-color: #b0c2b0 !important;}

/* ── 小头像与表情差分 ── */
div.custom-nvn-dialogue:is([data-char*="德尔菲尼"], [data-char*="德尔菲尼·柯涅尔"]) .custom-nvn-avatar-img {background-image: url("https://origin.picgo.net/2026/10/09/17eb70e5e194849d2a49305239c387dcac5ade9035262b14.png") !important;}

/* ── 角色配色变量 ── */
/* 梅法 */ div.custom-nvn-dialogue:is([data-char*="梅法"], [data-char*="梅法·格里亚德"]) {--main: #a3b8e0 !important; --sub: #eff3fc !important; --rgb: 163, 184, 224 !important; --motion-color: #bccbee !important;}

/* ── 小头像与表情差分 ── */
div.custom-nvn-dialogue:is([data-char*="梅法"], [data-char*="梅法·格里亚德"]) .custom-nvn-avatar-img {background-image: url("https://origin.picgo.net/2026/10/09/5def7d08ef95a3b170e457c10a7089b027585b9f3ab31e06.png") !important;}

/* ── 角色配色变量 ── */
/* 南丁格尔 */ div.custom-nvn-dialogue[data-char*="南丁格尔"] {--main: #d99a8a !important; --sub: #fbf0ed !important; --rgb: 217, 154, 138 !important; --motion-color: #e6b1a3 !important;}

/* ── 小头像与表情差分 ── */
div.custom-nvn-dialogue[data-char*="南丁格尔"] .custom-nvn-avatar-img {background-image: url("https://origin.picgo.net/2026/10/09/7ba8d84351398bde2d59f37b8576dfa103223c6e258a3bf5.png") !important;}

/* ── 角色配色变量 ── */
/* BS2 爱丽丝·利德尔 的短名绑定 */ div.custom-nvn-dialogue:is(:is([data-char*="爱丽丝"], [data-char*="爱·丽·丝"]), [data-char*="利德尔次女"]) {--main: #f2d680 !important; --sub: #fffdf5 !important; --rgb: 242, 214, 128 !important; --motion-color: #fae7a8 !important;}

/* ── 小头像与表情差分 ── */
div.custom-nvn-dialogue:is([data-char*="爱丽丝"], [data-char*="爱·丽·丝"]) .custom-nvn-avatar-img {background-image: url("https://origin.picgo.net/2026/10/08/fb26cbb7d5caf2b3e5bb006a54de0875c04384eb7c62cad1.png") !important;}

/* ── 大立绘 ── */
div.custom-nvn-dialogue:is([data-char*="爱丽丝"], [data-char*="爱·丽·丝"]) .custom-nvn-portrait-full {content: url("https://origin.picgo.net/2026/10/08/fb26cbb7d5caf2b3e5bb006a54de0875c04384eb7c62cad1.png") !important;}

    /* ══════════════════════════════════════════════════════════════
     * 中日双语布局
     * 溢出根因：外层 .nvn-text 是 flex，<ruby> 作为 flex 项 min-width:auto
     * 不肯收缩，而日文注音又把行撑得比中文宽 —— 于是整行横向溢出。
     * 改成 block 容器后 ruby 恢复常态，中文按字断行并与日文逐段贴合。
     * ══════════════════════════════════════════════════════════════ */
    div.custom-nvn-dialogue[data-mode^="bilingual"] .custom-nvn-text {
      display: block !important;
      min-width: 0 !important; max-width: 100% !important;
    }
    div.custom-nvn-dialogue[data-mode^="bilingual"] .custom-nvn-content { min-width: 0 !important; }
    div.custom-nvn-dialogue[data-mode^="bilingual"] .custom-nvn-bilingual-ruby {
      max-width: 100% !important;
      white-space: normal !important;
      word-break: break-word !important; overflow-wrap: anywhere !important;
    }
    div.custom-nvn-dialogue[data-mode^="bilingual"] .custom-nvn-bilingual-ruby rt {
      white-space: normal !important;
      word-break: break-word !important; overflow-wrap: anywhere !important;
    }

    /* ══════════════════════════════════════════════════════════════
     * 中日双语 · 分开版（data-mode="bilingual-split"）
     * 贴合版让中文与日文逐段对齐；分开版把日文整段放到中文下面。
     * 字号：中日同号 0.75em（rt 用 1em 抵消 ruby 基文的相对倍数）；
     * 行高收紧到 1.7，避免 ruby 的 line-height:2.3 在块级下撑出巨大空行。
     * ══════════════════════════════════════════════════════════════ */
    div.custom-nvn-dialogue[data-mode="bilingual-split"] .custom-nvn-bilingual-ruby {
      display: block !important;
      width: 100% !important; max-width: 100% !important;
      font-size: 1.05em !important; line-height: 1.7 !important;
    }
    div.custom-nvn-dialogue[data-mode="bilingual-split"] .custom-nvn-bilingual-ruby rt {
      display: block !important;
      width: 100% !important; max-width: 100% !important;
      font-size: 1em !important; line-height: 1.7 !important;
      margin-top: 3px !important; transform: none !important; text-align: left !important;
    }
`,
  };

  /* ---------------- 宿主窗口 / 文档 ---------------- */
  function getHostWin() {
    try { if (window.parent && window.parent !== window) return window.parent; } catch (_) {}
    return window;
  }
  function getHostDoc() {
    try {
      if (window.parent && window.parent !== window && window.parent.document) {
        return window.parent.document;
      }
    } catch (_) {}
    return document;
  }
  const HW = getHostWin();
  let HD = getHostDoc();

  function fn(name) {
    const scopes = [window, window.TavernHelper, HW, HW.TavernHelper];
    for (const s of scopes) {
      try { if (s && typeof s[name] === 'function') return s[name].bind(s); } catch (_) {}
    }
    return null;
  }

  /* ---------------- 主题判定：只有「深色框」需要单独一份 ---------------- */
  const ROW_SEL = '[class*="nvn-dialogue"][data-mode]';   /* class 会被改名，用 [class*=] */

  function themeFromDom() {
    try {
      const el = HD.querySelector(ROW_SEL);
      if (!el) return null;
      return el.getAttribute('data-mode') === 'dark' ? 'dark' : 'light';
    } catch (_) { return null; }
  }

  function themeFromConfig() {
    try {
      const ctx = HW.SillyTavern && HW.SillyTavern.getContext && HW.SillyTavern.getContext();
      if (!ctx || !Array.isArray(ctx.characters)) return null;
      const pick = function (ch) {
        let list = null;
        try { list = ch && ch.data && ch.data.extensions && ch.data.extensions.regex_scripts; } catch (_) {}
        if (!Array.isArray(list)) return null;
        for (const r of list) {
          if (!r || r.disabled) continue;
          const n = String(r.scriptName || '');
          if (n.indexOf('对白美化') === -1) continue;
          /* 「【中文 - 深色框对白美化v2.6】」含「中文」也含「深色」，所以先判深色 */
          return n.indexOf('深色') !== -1 ? 'dark' : 'light';
        }
        return null;
      };
      const id = ctx.characterId;
      if (id !== undefined && id !== null && ctx.characters[id]) {
        const t = pick(ctx.characters[id]);
        if (t) return t;
      }
      for (const ch of ctx.characters) { const t = pick(ch); if (t) return t; }
    } catch (_) {}
    return null;
  }

  /* ---------------- 注入 / 切换 ---------------- */
  let styleEl = null;
  let current = null;
  let cache = null;   /* 主题 -> 完整 CSS，避免每次重建字符串 */

  function fullCss(theme) {
    if (!cache) cache = {};
    if (!cache[theme]) cache[theme] = CSS[theme] + buildNewCharacterCss();
    return cache[theme];
  }

  function apply(theme, force) {
    if (!Object.prototype.hasOwnProperty.call(CSS, theme)) theme = 'light';
    if (!force && theme === current && styleEl && styleEl.isConnected) return;

    HD = getHostDoc();
    const head = HD.head || HD.documentElement;
    if (!head) return;

    try {
      for (const el of HD.querySelectorAll('#' + STYLE_ID)) {
        try { el.remove(); } catch (_) {}
      }
    } catch (_) {}

    const el = HD.createElement('style');
    el.id = STYLE_ID;
    el.setAttribute('data-owner', '对白美化·CSS注入器');
    el.setAttribute('data-nvn-theme', theme);
    el.setAttribute('data-nvn-version', VERSION);
    el.textContent = fullCss(theme) + "\n.mes_text div.custom-nvn-dialogue:is([data-char=\"鮟鱇鱼娘\"], [data-char^=\"鮟鱇鱼娘·\"]) .custom-nvn-name-initial{color:#b25734 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"鮟鱇鱼娘\"], [data-char^=\"鮟鱇鱼娘·\"]) .custom-nvn-rose-crest{color:#b25734 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"鮟鱇鱼娘\"], [data-char^=\"鮟鱇鱼娘·\"]) .custom-nvn-name-plate{border-left:3px solid #b25734 !important;border-top:1px solid rgba(178, 87, 52,0.35) !important;border-bottom:1px solid rgba(178, 87, 52,0.35) !important;background:linear-gradient(90deg, rgba(178, 87, 52,0.22) 0%, rgba(178, 87, 52,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"霸王花娘\"], [data-char^=\"霸王花娘·\"]) .custom-nvn-name-initial{color:#50b25a !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"霸王花娘\"], [data-char^=\"霸王花娘·\"]) .custom-nvn-rose-crest{color:#50b25a !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"霸王花娘\"], [data-char^=\"霸王花娘·\"]) .custom-nvn-name-plate{border-left:3px solid #50b25a !important;border-top:1px solid rgba(80, 178, 90,0.35) !important;border-bottom:1px solid rgba(80, 178, 90,0.35) !important;background:linear-gradient(90deg, rgba(80, 178, 90,0.22) 0%, rgba(80, 178, 90,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"宝箱娘\"], [data-char^=\"宝箱娘·\"]) .custom-nvn-name-initial{color:#b22e20 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"宝箱娘\"], [data-char^=\"宝箱娘·\"]) .custom-nvn-rose-crest{color:#b22e20 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"宝箱娘\"], [data-char^=\"宝箱娘·\"]) .custom-nvn-name-plate{border-left:3px solid #b22e20 !important;border-top:1px solid rgba(178, 46, 32,0.35) !important;border-bottom:1px solid rgba(178, 46, 32,0.35) !important;background:linear-gradient(90deg, rgba(178, 46, 32,0.22) 0%, rgba(178, 46, 32,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"贝娘\"], [data-char^=\"贝娘·\"]) .custom-nvn-name-initial{color:#e08164 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"贝娘\"], [data-char^=\"贝娘·\"]) .custom-nvn-rose-crest{color:#e08164 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"贝娘\"], [data-char^=\"贝娘·\"]) .custom-nvn-name-plate{border-left:3px solid #e08164 !important;border-top:1px solid rgba(224, 129, 100,0.35) !important;border-bottom:1px solid rgba(224, 129, 100,0.35) !important;background:linear-gradient(90deg, rgba(224, 129, 100,0.22) 0%, rgba(224, 129, 100,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"贝希摩斯娘\"], [data-char^=\"贝希摩斯娘·\"]) .custom-nvn-name-initial{color:#b25720 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"贝希摩斯娘\"], [data-char^=\"贝希摩斯娘·\"]) .custom-nvn-rose-crest{color:#b25720 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"贝希摩斯娘\"], [data-char^=\"贝希摩斯娘·\"]) .custom-nvn-name-plate{border-left:3px solid #b25720 !important;border-top:1px solid rgba(178, 87, 32,0.35) !important;border-bottom:1px solid rgba(178, 87, 32,0.35) !important;background:linear-gradient(90deg, rgba(178, 87, 32,0.22) 0%, rgba(178, 87, 32,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"不死鸟娘(phoenixb)\"], [data-char^=\"不死鸟娘(phoenixb)·\"]) .custom-nvn-name-initial{color:#e05328 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"不死鸟娘(phoenixb)\"], [data-char^=\"不死鸟娘(phoenixb)·\"]) .custom-nvn-rose-crest{color:#e05328 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"不死鸟娘(phoenixb)\"], [data-char^=\"不死鸟娘(phoenixb)·\"]) .custom-nvn-name-plate{border-left:3px solid #e05328 !important;border-top:1px solid rgba(224, 83, 40,0.35) !important;border-bottom:1px solid rgba(224, 83, 40,0.35) !important;background:linear-gradient(90deg, rgba(224, 83, 40,0.22) 0%, rgba(224, 83, 40,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"不死鸟娘\"], [data-char^=\"不死鸟娘·\"]) .custom-nvn-name-initial{color:#e05228 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"不死鸟娘\"], [data-char^=\"不死鸟娘·\"]) .custom-nvn-rose-crest{color:#e05228 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"不死鸟娘\"], [data-char^=\"不死鸟娘·\"]) .custom-nvn-name-plate{border-left:3px solid #e05228 !important;border-top:1px solid rgba(224, 82, 40,0.35) !important;border-bottom:1px solid rgba(224, 82, 40,0.35) !important;background:linear-gradient(90deg, rgba(224, 82, 40,0.22) 0%, rgba(224, 82, 40,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"蚕娘\"], [data-char^=\"蚕娘·\"]) .custom-nvn-name-initial{color:#b28e50 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"蚕娘\"], [data-char^=\"蚕娘·\"]) .custom-nvn-rose-crest{color:#b28e50 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"蚕娘\"], [data-char^=\"蚕娘·\"]) .custom-nvn-name-plate{border-left:3px solid #b28e50 !important;border-top:1px solid rgba(178, 142, 80,0.35) !important;border-bottom:1px solid rgba(178, 142, 80,0.35) !important;background:linear-gradient(90deg, rgba(178, 142, 80,0.22) 0%, rgba(178, 142, 80,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"达贡娘\"], [data-char^=\"达贡娘·\"]) .custom-nvn-name-initial{color:#b23a32 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"达贡娘\"], [data-char^=\"达贡娘·\"]) .custom-nvn-rose-crest{color:#b23a32 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"达贡娘\"], [data-char^=\"达贡娘·\"]) .custom-nvn-name-plate{border-left:3px solid #b23a32 !important;border-top:1px solid rgba(178, 58, 50,0.35) !important;border-bottom:1px solid rgba(178, 58, 50,0.35) !important;background:linear-gradient(90deg, rgba(178, 58, 50,0.22) 0%, rgba(178, 58, 50,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"冬贝利娘\"], [data-char^=\"冬贝利娘·\"]) .custom-nvn-name-initial{color:#63c458 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"冬贝利娘\"], [data-char^=\"冬贝利娘·\"]) .custom-nvn-rose-crest{color:#63c458 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"冬贝利娘\"], [data-char^=\"冬贝利娘·\"]) .custom-nvn-name-plate{border-left:3px solid #63c458 !important;border-top:1px solid rgba(99, 196, 88,0.35) !important;border-bottom:1px solid rgba(99, 196, 88,0.35) !important;background:linear-gradient(90deg, rgba(99, 196, 88,0.22) 0%, rgba(99, 196, 88,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"独角鲸娘\"], [data-char^=\"独角鲸娘·\"]) .custom-nvn-name-initial{color:#5469bb !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"独角鲸娘\"], [data-char^=\"独角鲸娘·\"]) .custom-nvn-rose-crest{color:#5469bb !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"独角鲸娘\"], [data-char^=\"独角鲸娘·\"]) .custom-nvn-name-plate{border-left:3px solid #5469bb !important;border-top:1px solid rgba(84, 105, 187,0.35) !important;border-bottom:1px solid rgba(84, 105, 187,0.35) !important;background:linear-gradient(90deg, rgba(84, 105, 187,0.22) 0%, rgba(84, 105, 187,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"蛾娘\"], [data-char^=\"蛾娘·\"]) .custom-nvn-name-initial{color:#b2764d !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"蛾娘\"], [data-char^=\"蛾娘·\"]) .custom-nvn-rose-crest{color:#b2764d !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"蛾娘\"], [data-char^=\"蛾娘·\"]) .custom-nvn-name-plate{border-left:3px solid #b2764d !important;border-top:1px solid rgba(178, 118, 77,0.35) !important;border-bottom:1px solid rgba(178, 118, 77,0.35) !important;background:linear-gradient(90deg, rgba(178, 118, 77,0.22) 0%, rgba(178, 118, 77,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"鳄鱼娘\"], [data-char^=\"鳄鱼娘·\"]) .custom-nvn-name-initial{color:#7db250 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"鳄鱼娘\"], [data-char^=\"鳄鱼娘·\"]) .custom-nvn-rose-crest{color:#7db250 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"鳄鱼娘\"], [data-char^=\"鳄鱼娘·\"]) .custom-nvn-name-plate{border-left:3px solid #7db250 !important;border-top:1px solid rgba(125, 178, 80,0.35) !important;border-bottom:1px solid rgba(125, 178, 80,0.35) !important;background:linear-gradient(90deg, rgba(125, 178, 80,0.22) 0%, rgba(125, 178, 80,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"二口娘\"], [data-char^=\"二口娘·\"]) .custom-nvn-name-initial{color:#89b250 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"二口娘\"], [data-char^=\"二口娘·\"]) .custom-nvn-rose-crest{color:#89b250 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"二口娘\"], [data-char^=\"二口娘·\"]) .custom-nvn-name-plate{border-left:3px solid #89b250 !important;border-top:1px solid rgba(137, 178, 80,0.35) !important;border-bottom:1px solid rgba(137, 178, 80,0.35) !important;background:linear-gradient(90deg, rgba(137, 178, 80,0.22) 0%, rgba(137, 178, 80,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"飞机杯娘\"], [data-char^=\"飞机杯娘·\"]) .custom-nvn-name-initial{color:#e0288e !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"飞机杯娘\"], [data-char^=\"飞机杯娘·\"]) .custom-nvn-rose-crest{color:#e0288e !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"飞机杯娘\"], [data-char^=\"飞机杯娘·\"]) .custom-nvn-name-plate{border-left:3px solid #e0288e !important;border-top:1px solid rgba(224, 40, 142,0.35) !important;border-bottom:1px solid rgba(224, 40, 142,0.35) !important;background:linear-gradient(90deg, rgba(224, 40, 142,0.22) 0%, rgba(224, 40, 142,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"废品人偶娘\"], [data-char^=\"废品人偶娘·\"]) .custom-nvn-name-initial{color:#b22d3d !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"废品人偶娘\"], [data-char^=\"废品人偶娘·\"]) .custom-nvn-rose-crest{color:#b22d3d !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"废品人偶娘\"], [data-char^=\"废品人偶娘·\"]) .custom-nvn-name-plate{border-left:3px solid #b22d3d !important;border-top:1px solid rgba(178, 45, 61,0.35) !important;border-bottom:1px solid rgba(178, 45, 61,0.35) !important;background:linear-gradient(90deg, rgba(178, 45, 61,0.22) 0%, rgba(178, 45, 61,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"凤蝶娘\"], [data-char^=\"凤蝶娘·\"]) .custom-nvn-name-initial{color:#b23931 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"凤蝶娘\"], [data-char^=\"凤蝶娘·\"]) .custom-nvn-rose-crest{color:#b23931 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"凤蝶娘\"], [data-char^=\"凤蝶娘·\"]) .custom-nvn-name-plate{border-left:3px solid #b23931 !important;border-top:1px solid rgba(178, 57, 49,0.35) !important;border-bottom:1px solid rgba(178, 57, 49,0.35) !important;background:linear-gradient(90deg, rgba(178, 57, 49,0.22) 0%, rgba(178, 57, 49,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"蝠鲼娘\"], [data-char^=\"蝠鲼娘·\"]) .custom-nvn-name-initial{color:#5950b2 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"蝠鲼娘\"], [data-char^=\"蝠鲼娘·\"]) .custom-nvn-rose-crest{color:#5950b2 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"蝠鲼娘\"], [data-char^=\"蝠鲼娘·\"]) .custom-nvn-name-plate{border-left:3px solid #5950b2 !important;border-top:1px solid rgba(89, 80, 178,0.35) !important;border-bottom:1px solid rgba(89, 80, 178,0.35) !important;background:linear-gradient(90deg, rgba(89, 80, 178,0.22) 0%, rgba(89, 80, 178,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"高阶蛞蝓娘\"], [data-char^=\"高阶蛞蝓娘·\"]) .custom-nvn-name-initial{color:#b29b50 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"高阶蛞蝓娘\"], [data-char^=\"高阶蛞蝓娘·\"]) .custom-nvn-rose-crest{color:#b29b50 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"高阶蛞蝓娘\"], [data-char^=\"高阶蛞蝓娘·\"]) .custom-nvn-name-plate{border-left:3px solid #b29b50 !important;border-top:1px solid rgba(178, 155, 80,0.35) !important;border-bottom:1px solid rgba(178, 155, 80,0.35) !important;background:linear-gradient(90deg, rgba(178, 155, 80,0.22) 0%, rgba(178, 155, 80,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"哥布林娘\"], [data-char^=\"哥布林娘·\"]) .custom-nvn-name-initial{color:#b26621 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"哥布林娘\"], [data-char^=\"哥布林娘·\"]) .custom-nvn-rose-crest{color:#b26621 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"哥布林娘\"], [data-char^=\"哥布林娘·\"]) .custom-nvn-name-plate{border-left:3px solid #b26621 !important;border-top:1px solid rgba(178, 102, 33,0.35) !important;border-bottom:1px solid rgba(178, 102, 33,0.35) !important;background:linear-gradient(90deg, rgba(178, 102, 33,0.22) 0%, rgba(178, 102, 33,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"果冻娘\"], [data-char^=\"果冻娘·\"]) .custom-nvn-name-initial{color:#21b7a0 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"果冻娘\"], [data-char^=\"果冻娘·\"]) .custom-nvn-rose-crest{color:#21b7a0 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"果冻娘\"], [data-char^=\"果冻娘·\"]) .custom-nvn-name-plate{border-left:3px solid #21b7a0 !important;border-top:1px solid rgba(33, 183, 160,0.35) !important;border-bottom:1px solid rgba(33, 183, 160,0.35) !important;background:linear-gradient(90deg, rgba(33, 183, 160,0.22) 0%, rgba(33, 183, 160,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"海参娘\"], [data-char^=\"海参娘·\"]) .custom-nvn-name-initial{color:#b72031 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"海参娘\"], [data-char^=\"海参娘·\"]) .custom-nvn-rose-crest{color:#b72031 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"海参娘\"], [data-char^=\"海参娘·\"]) .custom-nvn-name-plate{border-left:3px solid #b72031 !important;border-top:1px solid rgba(183, 32, 49,0.35) !important;border-bottom:1px solid rgba(183, 32, 49,0.35) !important;background:linear-gradient(90deg, rgba(183, 32, 49,0.22) 0%, rgba(183, 32, 49,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"海葵娘\"], [data-char^=\"海葵娘·\"]) .custom-nvn-name-initial{color:#c92846 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"海葵娘\"], [data-char^=\"海葵娘·\"]) .custom-nvn-rose-crest{color:#c92846 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"海葵娘\"], [data-char^=\"海葵娘·\"]) .custom-nvn-name-plate{border-left:3px solid #c92846 !important;border-top:1px solid rgba(201, 40, 70,0.35) !important;border-bottom:1px solid rgba(201, 40, 70,0.35) !important;background:linear-gradient(90deg, rgba(201, 40, 70,0.22) 0%, rgba(201, 40, 70,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"海鳝娘\"], [data-char^=\"海鳝娘·\"]) .custom-nvn-name-initial{color:#e08564 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"海鳝娘\"], [data-char^=\"海鳝娘·\"]) .custom-nvn-rose-crest{color:#e08564 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"海鳝娘\"], [data-char^=\"海鳝娘·\"]) .custom-nvn-name-plate{border-left:3px solid #e08564 !important;border-top:1px solid rgba(224, 133, 100,0.35) !important;border-bottom:1px solid rgba(224, 133, 100,0.35) !important;background:linear-gradient(90deg, rgba(224, 133, 100,0.22) 0%, rgba(224, 133, 100,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"海市蜃楼娘\"], [data-char^=\"海市蜃楼娘·\"]) .custom-nvn-name-initial{color:#2089b2 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"海市蜃楼娘\"], [data-char^=\"海市蜃楼娘·\"]) .custom-nvn-rose-crest{color:#2089b2 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"海市蜃楼娘\"], [data-char^=\"海市蜃楼娘·\"]) .custom-nvn-name-plate{border-left:3px solid #2089b2 !important;border-top:1px solid rgba(32, 137, 178,0.35) !important;border-bottom:1px solid rgba(32, 137, 178,0.35) !important;background:linear-gradient(90deg, rgba(32, 137, 178,0.22) 0%, rgba(32, 137, 178,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"海星娘\"], [data-char^=\"海星娘·\"]) .custom-nvn-name-initial{color:#505bb2 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"海星娘\"], [data-char^=\"海星娘·\"]) .custom-nvn-rose-crest{color:#505bb2 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"海星娘\"], [data-char^=\"海星娘·\"]) .custom-nvn-name-plate{border-left:3px solid #505bb2 !important;border-top:1px solid rgba(80, 91, 178,0.35) !important;border-bottom:1px solid rgba(80, 91, 178,0.35) !important;background:linear-gradient(90deg, rgba(80, 91, 178,0.22) 0%, rgba(80, 91, 178,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"胡蜂娘\"], [data-char^=\"胡蜂娘·\"]) .custom-nvn-name-initial{color:#bb215b !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"胡蜂娘\"], [data-char^=\"胡蜂娘·\"]) .custom-nvn-rose-crest{color:#bb215b !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"胡蜂娘\"], [data-char^=\"胡蜂娘·\"]) .custom-nvn-name-plate{border-left:3px solid #bb215b !important;border-top:1px solid rgba(187, 33, 91,0.35) !important;border-bottom:1px solid rgba(187, 33, 91,0.35) !important;background:linear-gradient(90deg, rgba(187, 33, 91,0.22) 0%, rgba(187, 33, 91,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"虎娘\"], [data-char^=\"虎娘·\"]) .custom-nvn-name-initial{color:#c4a139 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"虎娘\"], [data-char^=\"虎娘·\"]) .custom-nvn-rose-crest{color:#c4a139 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"虎娘\"], [data-char^=\"虎娘·\"]) .custom-nvn-name-plate{border-left:3px solid #c4a139 !important;border-top:1px solid rgba(196, 161, 57,0.35) !important;border-bottom:1px solid rgba(196, 161, 57,0.35) !important;background:linear-gradient(90deg, rgba(196, 161, 57,0.22) 0%, rgba(196, 161, 57,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"画像娘\"], [data-char^=\"画像娘·\"]) .custom-nvn-name-initial{color:#dea550 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"画像娘\"], [data-char^=\"画像娘·\"]) .custom-nvn-rose-crest{color:#dea550 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"画像娘\"], [data-char^=\"画像娘·\"]) .custom-nvn-name-plate{border-left:3px solid #dea550 !important;border-top:1px solid rgba(222, 165, 80,0.35) !important;border-bottom:1px solid rgba(222, 165, 80,0.35) !important;background:linear-gradient(90deg, rgba(222, 165, 80,0.22) 0%, rgba(222, 165, 80,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"灰熊娘\"], [data-char^=\"灰熊娘·\"]) .custom-nvn-name-initial{color:#b25849 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"灰熊娘\"], [data-char^=\"灰熊娘·\"]) .custom-nvn-rose-crest{color:#b25849 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"灰熊娘\"], [data-char^=\"灰熊娘·\"]) .custom-nvn-name-plate{border-left:3px solid #b25849 !important;border-top:1px solid rgba(178, 88, 73,0.35) !important;border-bottom:1px solid rgba(178, 88, 73,0.35) !important;background:linear-gradient(90deg, rgba(178, 88, 73,0.22) 0%, rgba(178, 88, 73,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"鸡蛇娘\"], [data-char^=\"鸡蛇娘·\"]) .custom-nvn-name-initial{color:#bc2127 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"鸡蛇娘\"], [data-char^=\"鸡蛇娘·\"]) .custom-nvn-rose-crest{color:#bc2127 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"鸡蛇娘\"], [data-char^=\"鸡蛇娘·\"]) .custom-nvn-name-plate{border-left:3px solid #bc2127 !important;border-top:1px solid rgba(188, 33, 39,0.35) !important;border-bottom:1px solid rgba(188, 33, 39,0.35) !important;background:linear-gradient(90deg, rgba(188, 33, 39,0.22) 0%, rgba(188, 33, 39,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"僵尸龙娘\"], [data-char^=\"僵尸龙娘·\"]) .custom-nvn-name-initial{color:#b23241 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"僵尸龙娘\"], [data-char^=\"僵尸龙娘·\"]) .custom-nvn-rose-crest{color:#b23241 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"僵尸龙娘\"], [data-char^=\"僵尸龙娘·\"]) .custom-nvn-name-plate{border-left:3px solid #b23241 !important;border-top:1px solid rgba(178, 50, 65,0.35) !important;border-bottom:1px solid rgba(178, 50, 65,0.35) !important;background:linear-gradient(90deg, rgba(178, 50, 65,0.22) 0%, rgba(178, 50, 65,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"巨龙娘\"], [data-char^=\"巨龙娘·\"]) .custom-nvn-name-initial{color:#b23947 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"巨龙娘\"], [data-char^=\"巨龙娘·\"]) .custom-nvn-rose-crest{color:#b23947 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"巨龙娘\"], [data-char^=\"巨龙娘·\"]) .custom-nvn-name-plate{border-left:3px solid #b23947 !important;border-top:1px solid rgba(178, 57, 71,0.35) !important;border-bottom:1px solid rgba(178, 57, 71,0.35) !important;background:linear-gradient(90deg, rgba(178, 57, 71,0.22) 0%, rgba(178, 57, 71,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"巨人娘\"], [data-char^=\"巨人娘·\"]) .custom-nvn-name-initial{color:#50b276 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"巨人娘\"], [data-char^=\"巨人娘·\"]) .custom-nvn-rose-crest{color:#50b276 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"巨人娘\"], [data-char^=\"巨人娘·\"]) .custom-nvn-name-plate{border-left:3px solid #50b276 !important;border-top:1px solid rgba(80, 178, 118,0.35) !important;border-bottom:1px solid rgba(80, 178, 118,0.35) !important;background:linear-gradient(90deg, rgba(80, 178, 118,0.22) 0%, rgba(80, 178, 118,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"剧毒史莱姆娘\"], [data-char^=\"剧毒史莱姆娘·\"]) .custom-nvn-name-initial{color:#3eb293 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"剧毒史莱姆娘\"], [data-char^=\"剧毒史莱姆娘·\"]) .custom-nvn-rose-crest{color:#3eb293 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"剧毒史莱姆娘\"], [data-char^=\"剧毒史莱姆娘·\"]) .custom-nvn-name-plate{border-left:3px solid #3eb293 !important;border-top:1px solid rgba(62, 178, 147,0.35) !important;border-bottom:1px solid rgba(62, 178, 147,0.35) !important;background:linear-gradient(90deg, rgba(62, 178, 147,0.22) 0%, rgba(62, 178, 147,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"攫速者娘\"], [data-char^=\"攫速者娘·\"]) .custom-nvn-name-initial{color:#e05a6e !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"攫速者娘\"], [data-char^=\"攫速者娘·\"]) .custom-nvn-rose-crest{color:#e05a6e !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"攫速者娘\"], [data-char^=\"攫速者娘·\"]) .custom-nvn-name-plate{border-left:3px solid #e05a6e !important;border-top:1px solid rgba(224, 90, 110,0.35) !important;border-bottom:1px solid rgba(224, 90, 110,0.35) !important;background:linear-gradient(90deg, rgba(224, 90, 110,0.22) 0%, rgba(224, 90, 110,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"卡班克尔娘\"], [data-char^=\"卡班克尔娘·\"]) .custom-nvn-name-initial{color:#6cc92d !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"卡班克尔娘\"], [data-char^=\"卡班克尔娘·\"]) .custom-nvn-rose-crest{color:#6cc92d !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"卡班克尔娘\"], [data-char^=\"卡班克尔娘·\"]) .custom-nvn-name-plate{border-left:3px solid #6cc92d !important;border-top:1px solid rgba(108, 201, 45,0.35) !important;border-bottom:1px solid rgba(108, 201, 45,0.35) !important;background:linear-gradient(90deg, rgba(108, 201, 45,0.22) 0%, rgba(108, 201, 45,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"昆虫娘们\"], [data-char^=\"昆虫娘们·\"]) .custom-nvn-name-initial{color:#b2774e !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"昆虫娘们\"], [data-char^=\"昆虫娘们·\"]) .custom-nvn-rose-crest{color:#b2774e !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"昆虫娘们\"], [data-char^=\"昆虫娘们·\"]) .custom-nvn-name-plate{border-left:3px solid #b2774e !important;border-top:1px solid rgba(178, 119, 78,0.35) !important;border-bottom:1px solid rgba(178, 119, 78,0.35) !important;background:linear-gradient(90deg, rgba(178, 119, 78,0.22) 0%, rgba(178, 119, 78,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"蛞蝓娘\"], [data-char^=\"蛞蝓娘·\"]) .custom-nvn-name-initial{color:#b26750 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"蛞蝓娘\"], [data-char^=\"蛞蝓娘·\"]) .custom-nvn-rose-crest{color:#b26750 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"蛞蝓娘\"], [data-char^=\"蛞蝓娘·\"]) .custom-nvn-name-plate{border-left:3px solid #b26750 !important;border-top:1px solid rgba(178, 103, 80,0.35) !important;border-bottom:1px solid rgba(178, 103, 80,0.35) !important;background:linear-gradient(90deg, rgba(178, 103, 80,0.22) 0%, rgba(178, 103, 80,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"蜡烛娘\"], [data-char^=\"蜡烛娘·\"]) .custom-nvn-name-initial{color:#4a85e0 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"蜡烛娘\"], [data-char^=\"蜡烛娘·\"]) .custom-nvn-rose-crest{color:#4a85e0 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"蜡烛娘\"], [data-char^=\"蜡烛娘·\"]) .custom-nvn-name-plate{border-left:3px solid #4a85e0 !important;border-top:1px solid rgba(74, 133, 224,0.35) !important;border-bottom:1px solid rgba(74, 133, 224,0.35) !important;background:linear-gradient(90deg, rgba(74, 133, 224,0.22) 0%, rgba(74, 133, 224,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"兰花螳螂娘\"], [data-char^=\"兰花螳螂娘·\"]) .custom-nvn-name-initial{color:#974bb2 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"兰花螳螂娘\"], [data-char^=\"兰花螳螂娘·\"]) .custom-nvn-rose-crest{color:#974bb2 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"兰花螳螂娘\"], [data-char^=\"兰花螳螂娘·\"]) .custom-nvn-name-plate{border-left:3px solid #974bb2 !important;border-top:1px solid rgba(151, 75, 178,0.35) !important;border-bottom:1px solid rgba(151, 75, 178,0.35) !important;background:linear-gradient(90deg, rgba(151, 75, 178,0.22) 0%, rgba(151, 75, 178,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"狼娘\"], [data-char^=\"狼娘·\"]) .custom-nvn-name-initial{color:#db7152 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"狼娘\"], [data-char^=\"狼娘·\"]) .custom-nvn-rose-crest{color:#db7152 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"狼娘\"], [data-char^=\"狼娘·\"]) .custom-nvn-name-plate{border-left:3px solid #db7152 !important;border-top:1px solid rgba(219, 113, 82,0.35) !important;border-bottom:1px solid rgba(219, 113, 82,0.35) !important;background:linear-gradient(90deg, rgba(219, 113, 82,0.22) 0%, rgba(219, 113, 82,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"利维坦娘\"], [data-char^=\"利维坦娘·\"]) .custom-nvn-name-initial{color:#204db2 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"利维坦娘\"], [data-char^=\"利维坦娘·\"]) .custom-nvn-rose-crest{color:#204db2 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"利维坦娘\"], [data-char^=\"利维坦娘·\"]) .custom-nvn-name-plate{border-left:3px solid #204db2 !important;border-top:1px solid rgba(32, 77, 178,0.35) !important;border-bottom:1px solid rgba(32, 77, 178,0.35) !important;background:linear-gradient(90deg, rgba(32, 77, 178,0.22) 0%, rgba(32, 77, 178,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"龙娘\"], [data-char^=\"龙娘·\"]) .custom-nvn-name-initial{color:#bb2a24 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"龙娘\"], [data-char^=\"龙娘·\"]) .custom-nvn-rose-crest{color:#bb2a24 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"龙娘\"], [data-char^=\"龙娘·\"]) .custom-nvn-name-plate{border-left:3px solid #bb2a24 !important;border-top:1px solid rgba(187, 42, 36,0.35) !important;border-bottom:1px solid rgba(187, 42, 36,0.35) !important;background:linear-gradient(90deg, rgba(187, 42, 36,0.22) 0%, rgba(187, 42, 36,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"龙鸟娘\"], [data-char^=\"龙鸟娘·\"]) .custom-nvn-name-initial{color:#e07f28 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"龙鸟娘\"], [data-char^=\"龙鸟娘·\"]) .custom-nvn-rose-crest{color:#e07f28 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"龙鸟娘\"], [data-char^=\"龙鸟娘·\"]) .custom-nvn-name-plate{border-left:3px solid #e07f28 !important;border-top:1px solid rgba(224, 127, 40,0.35) !important;border-bottom:1px solid rgba(224, 127, 40,0.35) !important;background:linear-gradient(90deg, rgba(224, 127, 40,0.22) 0%, rgba(224, 127, 40,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"麻雀娘\"], [data-char^=\"麻雀娘·\"]) .custom-nvn-name-initial{color:#b24820 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"麻雀娘\"], [data-char^=\"麻雀娘·\"]) .custom-nvn-rose-crest{color:#b24820 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"麻雀娘\"], [data-char^=\"麻雀娘·\"]) .custom-nvn-name-plate{border-left:3px solid #b24820 !important;border-top:1px solid rgba(178, 72, 32,0.35) !important;border-bottom:1px solid rgba(178, 72, 32,0.35) !important;background:linear-gradient(90deg, rgba(178, 72, 32,0.22) 0%, rgba(178, 72, 32,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"马可西亚斯娘\"], [data-char^=\"马可西亚斯娘·\"]) .custom-nvn-name-initial{color:#a8b24d !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"马可西亚斯娘\"], [data-char^=\"马可西亚斯娘·\"]) .custom-nvn-rose-crest{color:#a8b24d !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"马可西亚斯娘\"], [data-char^=\"马可西亚斯娘·\"]) .custom-nvn-name-plate{border-left:3px solid #a8b24d !important;border-top:1px solid rgba(168, 178, 77,0.35) !important;border-bottom:1px solid rgba(168, 178, 77,0.35) !important;background:linear-gradient(90deg, rgba(168, 178, 77,0.22) 0%, rgba(168, 178, 77,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"马人娘\"], [data-char^=\"马人娘·\"]) .custom-nvn-name-initial{color:#b2664c !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"马人娘\"], [data-char^=\"马人娘·\"]) .custom-nvn-rose-crest{color:#b2664c !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"马人娘\"], [data-char^=\"马人娘·\"]) .custom-nvn-name-plate{border-left:3px solid #b2664c !important;border-top:1px solid rgba(178, 102, 76,0.35) !important;border-bottom:1px solid rgba(178, 102, 76,0.35) !important;background:linear-gradient(90deg, rgba(178, 102, 76,0.22) 0%, rgba(178, 102, 76,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"曼德拉娘\"], [data-char^=\"曼德拉娘·\"]) .custom-nvn-name-initial{color:#9eb220 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"曼德拉娘\"], [data-char^=\"曼德拉娘·\"]) .custom-nvn-rose-crest{color:#9eb220 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"曼德拉娘\"], [data-char^=\"曼德拉娘·\"]) .custom-nvn-name-plate{border-left:3px solid #9eb220 !important;border-top:1px solid rgba(158, 178, 32,0.35) !important;border-bottom:1px solid rgba(158, 178, 32,0.35) !important;background:linear-gradient(90deg, rgba(158, 178, 32,0.22) 0%, rgba(158, 178, 32,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"毛毛虫娘\"], [data-char^=\"毛毛虫娘·\"]) .custom-nvn-name-initial{color:#b2ad50 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"毛毛虫娘\"], [data-char^=\"毛毛虫娘·\"]) .custom-nvn-rose-crest{color:#b2ad50 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"毛毛虫娘\"], [data-char^=\"毛毛虫娘·\"]) .custom-nvn-name-plate{border-left:3px solid #b2ad50 !important;border-top:1px solid rgba(178, 173, 80,0.35) !important;border-bottom:1px solid rgba(178, 173, 80,0.35) !important;background:linear-gradient(90deg, rgba(178, 173, 80,0.22) 0%, rgba(178, 173, 80,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"梅达娘\"], [data-char^=\"梅达娘·\"]) .custom-nvn-name-initial{color:#ba7c21 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"梅达娘\"], [data-char^=\"梅达娘·\"]) .custom-nvn-rose-crest{color:#ba7c21 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"梅达娘\"], [data-char^=\"梅达娘·\"]) .custom-nvn-name-plate{border-left:3px solid #ba7c21 !important;border-top:1px solid rgba(186, 124, 33,0.35) !important;border-bottom:1px solid rgba(186, 124, 33,0.35) !important;background:linear-gradient(90deg, rgba(186, 124, 33,0.22) 0%, rgba(186, 124, 33,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"迷你蟹娘\"], [data-char^=\"迷你蟹娘·\"]) .custom-nvn-name-initial{color:#d73158 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"迷你蟹娘\"], [data-char^=\"迷你蟹娘·\"]) .custom-nvn-rose-crest{color:#d73158 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"迷你蟹娘\"], [data-char^=\"迷你蟹娘·\"]) .custom-nvn-name-plate{border-left:3px solid #d73158 !important;border-top:1px solid rgba(215, 49, 88,0.35) !important;border-bottom:1px solid rgba(215, 49, 88,0.35) !important;background:linear-gradient(90deg, rgba(215, 49, 88,0.22) 0%, rgba(215, 49, 88,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"米诺陶洛斯娘\"], [data-char^=\"米诺陶洛斯娘·\"]) .custom-nvn-name-initial{color:#c9394b !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"米诺陶洛斯娘\"], [data-char^=\"米诺陶洛斯娘·\"]) .custom-nvn-rose-crest{color:#c9394b !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"米诺陶洛斯娘\"], [data-char^=\"米诺陶洛斯娘·\"]) .custom-nvn-name-plate{border-left:3px solid #c9394b !important;border-top:1px solid rgba(201, 57, 75,0.35) !important;border-bottom:1px solid rgba(201, 57, 75,0.35) !important;background:linear-gradient(90deg, rgba(201, 57, 75,0.22) 0%, rgba(201, 57, 75,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"蜜蜂娘\"], [data-char^=\"蜜蜂娘·\"]) .custom-nvn-name-initial{color:#e0d464 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"蜜蜂娘\"], [data-char^=\"蜜蜂娘·\"]) .custom-nvn-rose-crest{color:#e0d464 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"蜜蜂娘\"], [data-char^=\"蜜蜂娘·\"]) .custom-nvn-name-plate{border-left:3px solid #e0d464 !important;border-top:1px solid rgba(224, 212, 100,0.35) !important;border-bottom:1px solid rgba(224, 212, 100,0.35) !important;background:linear-gradient(90deg, rgba(224, 212, 100,0.22) 0%, rgba(224, 212, 100,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"蘑菇娘\"], [data-char^=\"蘑菇娘·\"]) .custom-nvn-name-initial{color:#d56c4d !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"蘑菇娘\"], [data-char^=\"蘑菇娘·\"]) .custom-nvn-rose-crest{color:#d56c4d !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"蘑菇娘\"], [data-char^=\"蘑菇娘·\"]) .custom-nvn-name-plate{border-left:3px solid #d56c4d !important;border-top:1px solid rgba(213, 108, 77,0.35) !important;border-bottom:1px solid rgba(213, 108, 77,0.35) !important;background:linear-gradient(90deg, rgba(213, 108, 77,0.22) 0%, rgba(213, 108, 77,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"魔界花娘\"], [data-char^=\"魔界花娘·\"]) .custom-nvn-name-initial{color:#b2564d !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"魔界花娘\"], [data-char^=\"魔界花娘·\"]) .custom-nvn-rose-crest{color:#b2564d !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"魔界花娘\"], [data-char^=\"魔界花娘·\"]) .custom-nvn-name-plate{border-left:3px solid #b2564d !important;border-top:1px solid rgba(178, 86, 77,0.35) !important;border-bottom:1px solid rgba(178, 86, 77,0.35) !important;background:linear-gradient(90deg, rgba(178, 86, 77,0.22) 0%, rgba(178, 86, 77,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"魔像娘\"], [data-char^=\"魔像娘·\"]) .custom-nvn-name-initial{color:#b2874b !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"魔像娘\"], [data-char^=\"魔像娘·\"]) .custom-nvn-rose-crest{color:#b2874b !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"魔像娘\"], [data-char^=\"魔像娘·\"]) .custom-nvn-name-plate{border-left:3px solid #b2874b !important;border-top:1px solid rgba(178, 135, 75,0.35) !important;border-bottom:1px solid rgba(178, 135, 75,0.35) !important;background:linear-gradient(90deg, rgba(178, 135, 75,0.22) 0%, rgba(178, 135, 75,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"木乃伊娘\"], [data-char^=\"木乃伊娘·\"]) .custom-nvn-name-initial{color:#b2393f !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"木乃伊娘\"], [data-char^=\"木乃伊娘·\"]) .custom-nvn-rose-crest{color:#b2393f !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"木乃伊娘\"], [data-char^=\"木乃伊娘·\"]) .custom-nvn-name-plate{border-left:3px solid #b2393f !important;border-top:1px solid rgba(178, 57, 63,0.35) !important;border-bottom:1px solid rgba(178, 57, 63,0.35) !important;background:linear-gradient(90deg, rgba(178, 57, 63,0.22) 0%, rgba(178, 57, 63,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"鲶鱼娘\"], [data-char^=\"鲶鱼娘·\"]) .custom-nvn-name-initial{color:#d23725 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"鲶鱼娘\"], [data-char^=\"鲶鱼娘·\"]) .custom-nvn-rose-crest{color:#d23725 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"鲶鱼娘\"], [data-char^=\"鲶鱼娘·\"]) .custom-nvn-name-plate{border-left:3px solid #d23725 !important;border-top:1px solid rgba(210, 55, 37,0.35) !important;border-bottom:1px solid rgba(210, 55, 37,0.35) !important;background:linear-gradient(90deg, rgba(210, 55, 37,0.22) 0%, rgba(210, 55, 37,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"凝胶立方娘\"], [data-char^=\"凝胶立方娘·\"]) .custom-nvn-name-initial{color:#45c4b6 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"凝胶立方娘\"], [data-char^=\"凝胶立方娘·\"]) .custom-nvn-rose-crest{color:#45c4b6 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"凝胶立方娘\"], [data-char^=\"凝胶立方娘·\"]) .custom-nvn-name-plate{border-left:3px solid #45c4b6 !important;border-top:1px solid rgba(69, 196, 182,0.35) !important;border-bottom:1px solid rgba(69, 196, 182,0.35) !important;background:linear-gradient(90deg, rgba(69, 196, 182,0.22) 0%, rgba(69, 196, 182,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"螃蟹娘\"], [data-char^=\"螃蟹娘·\"]) .custom-nvn-name-initial{color:#b22232 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"螃蟹娘\"], [data-char^=\"螃蟹娘·\"]) .custom-nvn-rose-crest{color:#b22232 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"螃蟹娘\"], [data-char^=\"螃蟹娘·\"]) .custom-nvn-name-plate{border-left:3px solid #b22232 !important;border-top:1px solid rgba(178, 34, 50,0.35) !important;border-bottom:1px solid rgba(178, 34, 50,0.35) !important;background:linear-gradient(90deg, rgba(178, 34, 50,0.22) 0%, rgba(178, 34, 50,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"青蛙娘\"], [data-char^=\"青蛙娘·\"]) .custom-nvn-name-initial{color:#9ab250 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"青蛙娘\"], [data-char^=\"青蛙娘·\"]) .custom-nvn-rose-crest{color:#9ab250 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"青蛙娘\"], [data-char^=\"青蛙娘·\"]) .custom-nvn-name-plate{border-left:3px solid #9ab250 !important;border-top:1px solid rgba(154, 178, 80,0.35) !important;border-bottom:1px solid rgba(154, 178, 80,0.35) !important;background:linear-gradient(90deg, rgba(154, 178, 80,0.22) 0%, rgba(154, 178, 80,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"蚯蚓娘\"], [data-char^=\"蚯蚓娘·\"]) .custom-nvn-name-initial{color:#b27247 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"蚯蚓娘\"], [data-char^=\"蚯蚓娘·\"]) .custom-nvn-rose-crest{color:#b27247 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"蚯蚓娘\"], [data-char^=\"蚯蚓娘·\"]) .custom-nvn-name-plate{border-left:3px solid #b27247 !important;border-top:1px solid rgba(178, 114, 71,0.35) !important;border-bottom:1px solid rgba(178, 114, 71,0.35) !important;background:linear-gradient(90deg, rgba(178, 114, 71,0.22) 0%, rgba(178, 114, 71,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"犬娘\"], [data-char^=\"犬娘·\"]) .custom-nvn-name-initial{color:#b25096 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"犬娘\"], [data-char^=\"犬娘·\"]) .custom-nvn-rose-crest{color:#b25096 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"犬娘\"], [data-char^=\"犬娘·\"]) .custom-nvn-name-plate{border-left:3px solid #b25096 !important;border-top:1px solid rgba(178, 80, 150,0.35) !important;border-bottom:1px solid rgba(178, 80, 150,0.35) !important;background:linear-gradient(90deg, rgba(178, 80, 150,0.22) 0%, rgba(178, 80, 150,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"裙带菜娘\"], [data-char^=\"裙带菜娘·\"]) .custom-nvn-name-initial{color:#b2ad50 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"裙带菜娘\"], [data-char^=\"裙带菜娘·\"]) .custom-nvn-rose-crest{color:#b2ad50 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"裙带菜娘\"], [data-char^=\"裙带菜娘·\"]) .custom-nvn-name-plate{border-left:3px solid #b2ad50 !important;border-top:1px solid rgba(178, 173, 80,0.35) !important;border-bottom:1px solid rgba(178, 173, 80,0.35) !important;background:linear-gradient(90deg, rgba(178, 173, 80,0.22) 0%, rgba(178, 173, 80,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"人魂娘\"], [data-char^=\"人魂娘·\"]) .custom-nvn-name-initial{color:#437dbb !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"人魂娘\"], [data-char^=\"人魂娘·\"]) .custom-nvn-rose-crest{color:#437dbb !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"人魂娘\"], [data-char^=\"人魂娘·\"]) .custom-nvn-name-plate{border-left:3px solid #437dbb !important;border-top:1px solid rgba(67, 125, 187,0.35) !important;border-bottom:1px solid rgba(67, 125, 187,0.35) !important;background:linear-gradient(90deg, rgba(67, 125, 187,0.22) 0%, rgba(67, 125, 187,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"熔岩娘\"], [data-char^=\"熔岩娘·\"]) .custom-nvn-name-initial{color:#e04428 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"熔岩娘\"], [data-char^=\"熔岩娘·\"]) .custom-nvn-rose-crest{color:#e04428 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"熔岩娘\"], [data-char^=\"熔岩娘·\"]) .custom-nvn-name-plate{border-left:3px solid #e04428 !important;border-top:1px solid rgba(224, 68, 40,0.35) !important;border-bottom:1px solid rgba(224, 68, 40,0.35) !important;background:linear-gradient(90deg, rgba(224, 68, 40,0.22) 0%, rgba(224, 68, 40,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"沙虫娘\"], [data-char^=\"沙虫娘·\"]) .custom-nvn-name-initial{color:#8cb250 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"沙虫娘\"], [data-char^=\"沙虫娘·\"]) .custom-nvn-rose-crest{color:#8cb250 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"沙虫娘\"], [data-char^=\"沙虫娘·\"]) .custom-nvn-name-plate{border-left:3px solid #8cb250 !important;border-top:1px solid rgba(140, 178, 80,0.35) !important;border-bottom:1px solid rgba(140, 178, 80,0.35) !important;background:linear-gradient(90deg, rgba(140, 178, 80,0.22) 0%, rgba(140, 178, 80,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"沙拉克娘\"], [data-char^=\"沙拉克娘·\"]) .custom-nvn-name-initial{color:#b22031 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"沙拉克娘\"], [data-char^=\"沙拉克娘·\"]) .custom-nvn-rose-crest{color:#b22031 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"沙拉克娘\"], [data-char^=\"沙拉克娘·\"]) .custom-nvn-name-plate{border-left:3px solid #b22031 !important;border-top:1px solid rgba(178, 32, 49,0.35) !important;border-bottom:1px solid rgba(178, 32, 49,0.35) !important;background:linear-gradient(90deg, rgba(178, 32, 49,0.22) 0%, rgba(178, 32, 49,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"珊瑚娘\"], [data-char^=\"珊瑚娘·\"]) .custom-nvn-name-initial{color:#50aab2 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"珊瑚娘\"], [data-char^=\"珊瑚娘·\"]) .custom-nvn-rose-crest{color:#50aab2 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"珊瑚娘\"], [data-char^=\"珊瑚娘·\"]) .custom-nvn-name-plate{border-left:3px solid #50aab2 !important;border-top:1px solid rgba(80, 170, 178,0.35) !important;border-bottom:1px solid rgba(80, 170, 178,0.35) !important;background:linear-gradient(90deg, rgba(80, 170, 178,0.22) 0%, rgba(80, 170, 178,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"石像鬼娘\"], [data-char^=\"石像鬼娘·\"]) .custom-nvn-name-initial{color:#b24941 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"石像鬼娘\"], [data-char^=\"石像鬼娘·\"]) .custom-nvn-rose-crest{color:#b24941 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"石像鬼娘\"], [data-char^=\"石像鬼娘·\"]) .custom-nvn-name-plate{border-left:3px solid #b24941 !important;border-top:1px solid rgba(178, 73, 65,0.35) !important;border-bottom:1px solid rgba(178, 73, 65,0.35) !important;background:linear-gradient(90deg, rgba(178, 73, 65,0.22) 0%, rgba(178, 73, 65,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"食蚁兽娘\"], [data-char^=\"食蚁兽娘·\"]) .custom-nvn-name-initial{color:#5050b2 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"食蚁兽娘\"], [data-char^=\"食蚁兽娘·\"]) .custom-nvn-rose-crest{color:#5050b2 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"食蚁兽娘\"], [data-char^=\"食蚁兽娘·\"]) .custom-nvn-name-plate{border-left:3px solid #5050b2 !important;border-top:1px solid rgba(80, 80, 178,0.35) !important;border-bottom:1px solid rgba(80, 80, 178,0.35) !important;background:linear-gradient(90deg, rgba(80, 80, 178,0.22) 0%, rgba(80, 80, 178,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"史莱姆贝丝娘\"], [data-char^=\"史莱姆贝丝娘·\"]) .custom-nvn-name-initial{color:#d15e7b !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"史莱姆贝丝娘\"], [data-char^=\"史莱姆贝丝娘·\"]) .custom-nvn-rose-crest{color:#d15e7b !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"史莱姆贝丝娘\"], [data-char^=\"史莱姆贝丝娘·\"]) .custom-nvn-name-plate{border-left:3px solid #d15e7b !important;border-top:1px solid rgba(209, 94, 123,0.35) !important;border-bottom:1px solid rgba(209, 94, 123,0.35) !important;background:linear-gradient(90deg, rgba(209, 94, 123,0.22) 0%, rgba(209, 94, 123,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"史莱姆娘\"], [data-char^=\"史莱姆娘·\"]) .custom-nvn-name-initial{color:#274ed9 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"史莱姆娘\"], [data-char^=\"史莱姆娘·\"]) .custom-nvn-rose-crest{color:#274ed9 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"史莱姆娘\"], [data-char^=\"史莱姆娘·\"]) .custom-nvn-name-plate{border-left:3px solid #274ed9 !important;border-top:1px solid rgba(39, 78, 217,0.35) !important;border-bottom:1px solid rgba(39, 78, 217,0.35) !important;background:linear-gradient(90deg, rgba(39, 78, 217,0.22) 0%, rgba(39, 78, 217,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"兽人娘\"], [data-char^=\"兽人娘·\"]) .custom-nvn-name-initial{color:#e06486 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"兽人娘\"], [data-char^=\"兽人娘·\"]) .custom-nvn-rose-crest{color:#e06486 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"兽人娘\"], [data-char^=\"兽人娘·\"]) .custom-nvn-name-plate{border-left:3px solid #e06486 !important;border-top:1px solid rgba(224, 100, 134,0.35) !important;border-bottom:1px solid rgba(224, 100, 134,0.35) !important;background:linear-gradient(90deg, rgba(224, 100, 134,0.22) 0%, rgba(224, 100, 134,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"鼠娘\"], [data-char^=\"鼠娘·\"]) .custom-nvn-name-initial{color:#505ab2 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"鼠娘\"], [data-char^=\"鼠娘·\"]) .custom-nvn-rose-crest{color:#505ab2 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"鼠娘\"], [data-char^=\"鼠娘·\"]) .custom-nvn-name-plate{border-left:3px solid #505ab2 !important;border-top:1px solid rgba(80, 90, 178,0.35) !important;border-bottom:1px solid rgba(80, 90, 178,0.35) !important;background:linear-gradient(90deg, rgba(80, 90, 178,0.22) 0%, rgba(80, 90, 178,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"树绳妖娘\"], [data-char^=\"树绳妖娘·\"]) .custom-nvn-name-initial{color:#b25098 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"树绳妖娘\"], [data-char^=\"树绳妖娘·\"]) .custom-nvn-rose-crest{color:#b25098 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"树绳妖娘\"], [data-char^=\"树绳妖娘·\"]) .custom-nvn-name-plate{border-left:3px solid #b25098 !important;border-top:1px solid rgba(178, 80, 152,0.35) !important;border-bottom:1px solid rgba(178, 80, 152,0.35) !important;background:linear-gradient(90deg, rgba(178, 80, 152,0.22) 0%, rgba(178, 80, 152,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"水龙娘\"], [data-char^=\"水龙娘·\"]) .custom-nvn-name-initial{color:#317bd6 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"水龙娘\"], [data-char^=\"水龙娘·\"]) .custom-nvn-rose-crest{color:#317bd6 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"水龙娘\"], [data-char^=\"水龙娘·\"]) .custom-nvn-name-plate{border-left:3px solid #317bd6 !important;border-top:1px solid rgba(49, 123, 214,0.35) !important;border-bottom:1px solid rgba(49, 123, 214,0.35) !important;background:linear-gradient(90deg, rgba(49, 123, 214,0.22) 0%, rgba(49, 123, 214,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"水母娘\"], [data-char^=\"水母娘·\"]) .custom-nvn-name-initial{color:#b2352b !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"水母娘\"], [data-char^=\"水母娘·\"]) .custom-nvn-rose-crest{color:#b2352b !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"水母娘\"], [data-char^=\"水母娘·\"]) .custom-nvn-name-plate{border-left:3px solid #b2352b !important;border-top:1px solid rgba(178, 53, 43,0.35) !important;border-bottom:1px solid rgba(178, 53, 43,0.35) !important;background:linear-gradient(90deg, rgba(178, 53, 43,0.22) 0%, rgba(178, 53, 43,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"水蛭娘\"], [data-char^=\"水蛭娘·\"]) .custom-nvn-name-initial{color:#b22020 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"水蛭娘\"], [data-char^=\"水蛭娘·\"]) .custom-nvn-rose-crest{color:#b22020 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"水蛭娘\"], [data-char^=\"水蛭娘·\"]) .custom-nvn-name-plate{border-left:3px solid #b22020 !important;border-top:1px solid rgba(178, 32, 32,0.35) !important;border-bottom:1px solid rgba(178, 32, 32,0.35) !important;background:linear-gradient(90deg, rgba(178, 32, 32,0.22) 0%, rgba(178, 32, 32,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"塔兰图拉毒蛛娘\"], [data-char^=\"塔兰图拉毒蛛娘·\"]) .custom-nvn-name-initial{color:#b22030 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"塔兰图拉毒蛛娘\"], [data-char^=\"塔兰图拉毒蛛娘·\"]) .custom-nvn-rose-crest{color:#b22030 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"塔兰图拉毒蛛娘\"], [data-char^=\"塔兰图拉毒蛛娘·\"]) .custom-nvn-name-plate{border-left:3px solid #b22030 !important;border-top:1px solid rgba(178, 32, 48,0.35) !important;border-bottom:1px solid rgba(178, 32, 48,0.35) !important;background:linear-gradient(90deg, rgba(178, 32, 48,0.22) 0%, rgba(178, 32, 48,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"螳螂娘\"], [data-char^=\"螳螂娘·\"]) .custom-nvn-name-initial{color:#80b22f !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"螳螂娘\"], [data-char^=\"螳螂娘·\"]) .custom-nvn-rose-crest{color:#80b22f !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"螳螂娘\"], [data-char^=\"螳螂娘·\"]) .custom-nvn-name-plate{border-left:3px solid #80b22f !important;border-top:1px solid rgba(128, 178, 47,0.35) !important;border-bottom:1px solid rgba(128, 178, 47,0.35) !important;background:linear-gradient(90deg, rgba(128, 178, 47,0.22) 0%, rgba(128, 178, 47,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"涂魔像娘\"], [data-char^=\"涂魔像娘·\"]) .custom-nvn-name-initial{color:#b27b36 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"涂魔像娘\"], [data-char^=\"涂魔像娘·\"]) .custom-nvn-rose-crest{color:#b27b36 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"涂魔像娘\"], [data-char^=\"涂魔像娘·\"]) .custom-nvn-name-plate{border-left:3px solid #b27b36 !important;border-top:1px solid rgba(178, 123, 54,0.35) !important;border-bottom:1px solid rgba(178, 123, 54,0.35) !important;background:linear-gradient(90deg, rgba(178, 123, 54,0.22) 0%, rgba(178, 123, 54,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"兔娘\"], [data-char^=\"兔娘·\"]) .custom-nvn-name-initial{color:#df385e !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"兔娘\"], [data-char^=\"兔娘·\"]) .custom-nvn-rose-crest{color:#df385e !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"兔娘\"], [data-char^=\"兔娘·\"]) .custom-nvn-name-plate{border-left:3px solid #df385e !important;border-top:1px solid rgba(223, 56, 94,0.35) !important;border-bottom:1px solid rgba(223, 56, 94,0.35) !important;background:linear-gradient(90deg, rgba(223, 56, 94,0.22) 0%, rgba(223, 56, 94,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"兔子史莱姆娘\"], [data-char^=\"兔子史莱姆娘·\"]) .custom-nvn-name-initial{color:#e05380 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"兔子史莱姆娘\"], [data-char^=\"兔子史莱姆娘·\"]) .custom-nvn-rose-crest{color:#e05380 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"兔子史莱姆娘\"], [data-char^=\"兔子史莱姆娘·\"]) .custom-nvn-name-plate{border-left:3px solid #e05380 !important;border-top:1px solid rgba(224, 83, 128,0.35) !important;border-bottom:1px solid rgba(224, 83, 128,0.35) !important;background:linear-gradient(90deg, rgba(224, 83, 128,0.22) 0%, rgba(224, 83, 128,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"鸵鸟娘\"], [data-char^=\"鸵鸟娘·\"]) .custom-nvn-name-initial{color:#dc7655 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"鸵鸟娘\"], [data-char^=\"鸵鸟娘·\"]) .custom-nvn-rose-crest{color:#dc7655 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"鸵鸟娘\"], [data-char^=\"鸵鸟娘·\"]) .custom-nvn-name-plate{border-left:3px solid #dc7655 !important;border-top:1px solid rgba(220, 118, 85,0.35) !important;border-bottom:1px solid rgba(220, 118, 85,0.35) !important;background:linear-gradient(90deg, rgba(220, 118, 85,0.22) 0%, rgba(220, 118, 85,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"薇薇尔娘\"], [data-char^=\"薇薇尔娘·\"]) .custom-nvn-name-initial{color:#cb8524 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"薇薇尔娘\"], [data-char^=\"薇薇尔娘·\"]) .custom-nvn-rose-crest{color:#cb8524 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"薇薇尔娘\"], [data-char^=\"薇薇尔娘·\"]) .custom-nvn-name-plate{border-left:3px solid #cb8524 !important;border-top:1px solid rgba(203, 133, 36,0.35) !important;border-bottom:1px solid rgba(203, 133, 36,0.35) !important;background:linear-gradient(90deg, rgba(203, 133, 36,0.22) 0%, rgba(203, 133, 36,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"蚊子娘\"], [data-char^=\"蚊子娘·\"]) .custom-nvn-name-initial{color:#4d79b2 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"蚊子娘\"], [data-char^=\"蚊子娘·\"]) .custom-nvn-rose-crest{color:#4d79b2 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"蚊子娘\"], [data-char^=\"蚊子娘·\"]) .custom-nvn-name-plate{border-left:3px solid #4d79b2 !important;border-top:1px solid rgba(77, 121, 178,0.35) !important;border-bottom:1px solid rgba(77, 121, 178,0.35) !important;background:linear-gradient(90deg, rgba(77, 121, 178,0.22) 0%, rgba(77, 121, 178,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"蜈蚣娘\"], [data-char^=\"蜈蚣娘·\"]) .custom-nvn-name-initial{color:#8eb235 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"蜈蚣娘\"], [data-char^=\"蜈蚣娘·\"]) .custom-nvn-rose-crest{color:#8eb235 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"蜈蚣娘\"], [data-char^=\"蜈蚣娘·\"]) .custom-nvn-name-plate{border-left:3px solid #8eb235 !important;border-top:1px solid rgba(142, 178, 53,0.35) !important;border-bottom:1px solid rgba(142, 178, 53,0.35) !important;background:linear-gradient(90deg, rgba(142, 178, 53,0.22) 0%, rgba(142, 178, 53,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"西瓜娘\"], [data-char^=\"西瓜娘·\"]) .custom-nvn-name-initial{color:#e0cd64 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"西瓜娘\"], [data-char^=\"西瓜娘·\"]) .custom-nvn-rose-crest{color:#e0cd64 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"西瓜娘\"], [data-char^=\"西瓜娘·\"]) .custom-nvn-name-plate{border-left:3px solid #e0cd64 !important;border-top:1px solid rgba(224, 205, 100,0.35) !important;border-bottom:1px solid rgba(224, 205, 100,0.35) !important;background:linear-gradient(90deg, rgba(224, 205, 100,0.22) 0%, rgba(224, 205, 100,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"仙人掌娘\"], [data-char^=\"仙人掌娘·\"]) .custom-nvn-name-initial{color:#dd3227 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"仙人掌娘\"], [data-char^=\"仙人掌娘·\"]) .custom-nvn-rose-crest{color:#dd3227 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"仙人掌娘\"], [data-char^=\"仙人掌娘·\"]) .custom-nvn-name-plate{border-left:3px solid #dd3227 !important;border-top:1px solid rgba(221, 50, 39,0.35) !important;border-bottom:1px solid rgba(221, 50, 39,0.35) !important;background:linear-gradient(90deg, rgba(221, 50, 39,0.22) 0%, rgba(221, 50, 39,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"蝎娘\"], [data-char^=\"蝎娘·\"]) .custom-nvn-name-initial{color:#8a20b2 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"蝎娘\"], [data-char^=\"蝎娘·\"]) .custom-nvn-rose-crest{color:#8a20b2 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"蝎娘\"], [data-char^=\"蝎娘·\"]) .custom-nvn-name-plate{border-left:3px solid #8a20b2 !important;border-top:1px solid rgba(138, 32, 178,0.35) !important;border-bottom:1px solid rgba(138, 32, 178,0.35) !important;background:linear-gradient(90deg, rgba(138, 32, 178,0.22) 0%, rgba(138, 32, 178,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"眼镜蛇娘\"], [data-char^=\"眼镜蛇娘·\"]) .custom-nvn-name-initial{color:#3671b2 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"眼镜蛇娘\"], [data-char^=\"眼镜蛇娘·\"]) .custom-nvn-rose-crest{color:#3671b2 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"眼镜蛇娘\"], [data-char^=\"眼镜蛇娘·\"]) .custom-nvn-name-plate{border-left:3px solid #3671b2 !important;border-top:1px solid rgba(54, 113, 178,0.35) !important;border-bottom:1px solid rgba(54, 113, 178,0.35) !important;background:linear-gradient(90deg, rgba(54, 113, 178,0.22) 0%, rgba(54, 113, 178,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"羊娘\"], [data-char^=\"羊娘·\"]) .custom-nvn-name-initial{color:#b79920 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"羊娘\"], [data-char^=\"羊娘·\"]) .custom-nvn-rose-crest{color:#b79920 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"羊娘\"], [data-char^=\"羊娘·\"]) .custom-nvn-name-plate{border-left:3px solid #b79920 !important;border-top:1px solid rgba(183, 153, 32,0.35) !important;border-bottom:1px solid rgba(183, 153, 32,0.35) !important;background:linear-gradient(90deg, rgba(183, 153, 32,0.22) 0%, rgba(183, 153, 32,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"一反木绵娘\"], [data-char^=\"一反木绵娘·\"]) .custom-nvn-name-initial{color:#2f20b2 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"一反木绵娘\"], [data-char^=\"一反木绵娘·\"]) .custom-nvn-rose-crest{color:#2f20b2 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"一反木绵娘\"], [data-char^=\"一反木绵娘·\"]) .custom-nvn-name-plate{border-left:3px solid #2f20b2 !important;border-top:1px solid rgba(47, 32, 178,0.35) !important;border-bottom:1px solid rgba(47, 32, 178,0.35) !important;background:linear-gradient(90deg, rgba(47, 32, 178,0.22) 0%, rgba(47, 32, 178,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"蚁娘\"], [data-char^=\"蚁娘·\"]) .custom-nvn-name-initial{color:#b2784f !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"蚁娘\"], [data-char^=\"蚁娘·\"]) .custom-nvn-rose-crest{color:#b2784f !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"蚁娘\"], [data-char^=\"蚁娘·\"]) .custom-nvn-name-plate{border-left:3px solid #b2784f !important;border-top:1px solid rgba(178, 120, 79,0.35) !important;border-bottom:1px solid rgba(178, 120, 79,0.35) !important;background:linear-gradient(90deg, rgba(178, 120, 79,0.22) 0%, rgba(178, 120, 79,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"蚁狮娘\"], [data-char^=\"蚁狮娘·\"]) .custom-nvn-name-initial{color:#b25072 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"蚁狮娘\"], [data-char^=\"蚁狮娘·\"]) .custom-nvn-rose-crest{color:#b25072 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"蚁狮娘\"], [data-char^=\"蚁狮娘·\"]) .custom-nvn-name-plate{border-left:3px solid #b25072 !important;border-top:1px solid rgba(178, 80, 114,0.35) !important;border-bottom:1px solid rgba(178, 80, 114,0.35) !important;background:linear-gradient(90deg, rgba(178, 80, 114,0.22) 0%, rgba(178, 80, 114,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"隐形虫娘\"], [data-char^=\"隐形虫娘·\"]) .custom-nvn-name-initial{color:#504db2 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"隐形虫娘\"], [data-char^=\"隐形虫娘·\"]) .custom-nvn-rose-crest{color:#504db2 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"隐形虫娘\"], [data-char^=\"隐形虫娘·\"]) .custom-nvn-name-plate{border-left:3px solid #504db2 !important;border-top:1px solid rgba(80, 77, 178,0.35) !important;border-bottom:1px solid rgba(80, 77, 178,0.35) !important;background:linear-gradient(90deg, rgba(80, 77, 178,0.22) 0%, rgba(80, 77, 178,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"幽灵娘\"], [data-char^=\"幽灵娘·\"]) .custom-nvn-name-initial{color:#64c8e0 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"幽灵娘\"], [data-char^=\"幽灵娘·\"]) .custom-nvn-rose-crest{color:#64c8e0 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"幽灵娘\"], [data-char^=\"幽灵娘·\"]) .custom-nvn-name-plate{border-left:3px solid #64c8e0 !important;border-top:1px solid rgba(100, 200, 224,0.35) !important;border-bottom:1px solid rgba(100, 200, 224,0.35) !important;background:linear-gradient(90deg, rgba(100, 200, 224,0.22) 0%, rgba(100, 200, 224,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"粘体娘\"], [data-char^=\"粘体娘·\"]) .custom-nvn-name-initial{color:#e03c5b !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"粘体娘\"], [data-char^=\"粘体娘·\"]) .custom-nvn-rose-crest{color:#e03c5b !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"粘体娘\"], [data-char^=\"粘体娘·\"]) .custom-nvn-name-plate{border-left:3px solid #e03c5b !important;border-top:1px solid rgba(224, 60, 91,0.35) !important;border-bottom:1px solid rgba(224, 60, 91,0.35) !important;background:linear-gradient(90deg, rgba(224, 60, 91,0.22) 0%, rgba(224, 60, 91,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"蟑螂娘\"], [data-char^=\"蟑螂娘·\"]) .custom-nvn-name-initial{color:#5750b2 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"蟑螂娘\"], [data-char^=\"蟑螂娘·\"]) .custom-nvn-rose-crest{color:#5750b2 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"蟑螂娘\"], [data-char^=\"蟑螂娘·\"]) .custom-nvn-name-plate{border-left:3px solid #5750b2 !important;border-top:1px solid rgba(87, 80, 178,0.35) !important;border-bottom:1px solid rgba(87, 80, 178,0.35) !important;background:linear-gradient(90deg, rgba(87, 80, 178,0.22) 0%, rgba(87, 80, 178,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"蜘蛛娘\"], [data-char^=\"蜘蛛娘·\"]) .custom-nvn-name-initial{color:#d76182 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"蜘蛛娘\"], [data-char^=\"蜘蛛娘·\"]) .custom-nvn-rose-crest{color:#d76182 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"蜘蛛娘\"], [data-char^=\"蜘蛛娘·\"]) .custom-nvn-name-plate{border-left:3px solid #d76182 !important;border-top:1px solid rgba(215, 97, 130,0.35) !important;border-bottom:1px solid rgba(215, 97, 130,0.35) !important;background:linear-gradient(90deg, rgba(215, 97, 130,0.22) 0%, rgba(215, 97, 130,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"猪笼草娘\"], [data-char^=\"猪笼草娘·\"]) .custom-nvn-name-initial{color:#3eb232 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"猪笼草娘\"], [data-char^=\"猪笼草娘·\"]) .custom-nvn-rose-crest{color:#3eb232 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"猪笼草娘\"], [data-char^=\"猪笼草娘·\"]) .custom-nvn-name-plate{border-left:3px solid #3eb232 !important;border-top:1px solid rgba(62, 178, 50,0.35) !important;border-bottom:1px solid rgba(62, 178, 50,0.35) !important;background:linear-gradient(90deg, rgba(62, 178, 50,0.22) 0%, rgba(62, 178, 50,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"自动机娘\"], [data-char^=\"自动机娘·\"]) .custom-nvn-name-initial{color:#7549b2 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"自动机娘\"], [data-char^=\"自动机娘·\"]) .custom-nvn-rose-crest{color:#7549b2 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"自动机娘\"], [data-char^=\"自动机娘·\"]) .custom-nvn-name-plate{border-left:3px solid #7549b2 !important;border-top:1px solid rgba(117, 73, 178,0.35) !important;border-bottom:1px solid rgba(117, 73, 178,0.35) !important;background:linear-gradient(90deg, rgba(117, 73, 178,0.22) 0%, rgba(117, 73, 178,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"诅咒人偶娘\"], [data-char^=\"诅咒人偶娘·\"]) .custom-nvn-name-initial{color:#8650b2 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"诅咒人偶娘\"], [data-char^=\"诅咒人偶娘·\"]) .custom-nvn-rose-crest{color:#8650b2 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"诅咒人偶娘\"], [data-char^=\"诅咒人偶娘·\"]) .custom-nvn-name-plate{border-left:3px solid #8650b2 !important;border-top:1px solid rgba(134, 80, 178,0.35) !important;border-bottom:1px solid rgba(134, 80, 178,0.35) !important;background:linear-gradient(90deg, rgba(134, 80, 178,0.22) 0%, rgba(134, 80, 178,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"QQ\"], [data-char^=\"QQ·\"]) .custom-nvn-name-initial{color:#6284da !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"QQ\"], [data-char^=\"QQ·\"]) .custom-nvn-rose-crest{color:#6284da !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"QQ\"], [data-char^=\"QQ·\"]) .custom-nvn-name-plate{border-left:3px solid #6284da !important;border-top:1px solid rgba(98, 132, 218,0.35) !important;border-bottom:1px solid rgba(98, 132, 218,0.35) !important;background:linear-gradient(90deg, rgba(98, 132, 218,0.22) 0%, rgba(98, 132, 218,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"TT\"], [data-char^=\"TT·\"]) .custom-nvn-name-initial{color:#b72e63 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"TT\"], [data-char^=\"TT·\"]) .custom-nvn-rose-crest{color:#b72e63 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"TT\"], [data-char^=\"TT·\"]) .custom-nvn-name-plate{border-left:3px solid #b72e63 !important;border-top:1px solid rgba(183, 46, 99,0.35) !important;border-bottom:1px solid rgba(183, 46, 99,0.35) !important;background:linear-gradient(90deg, rgba(183, 46, 99,0.22) 0%, rgba(183, 46, 99,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"阿加利亚雷普特\"], [data-char^=\"阿加利亚雷普特·\"]) .custom-nvn-name-initial{color:#b25097 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"阿加利亚雷普特\"], [data-char^=\"阿加利亚雷普特·\"]) .custom-nvn-rose-crest{color:#b25097 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"阿加利亚雷普特\"], [data-char^=\"阿加利亚雷普特·\"]) .custom-nvn-name-plate{border-left:3px solid #b25097 !important;border-top:1px solid rgba(178, 80, 151,0.35) !important;border-bottom:1px solid rgba(178, 80, 151,0.35) !important;background:linear-gradient(90deg, rgba(178, 80, 151,0.22) 0%, rgba(178, 80, 151,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"阿露艾露玛\"], [data-char^=\"阿露艾露玛·\"]) .custom-nvn-name-initial{color:#b22520 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"阿露艾露玛\"], [data-char^=\"阿露艾露玛·\"]) .custom-nvn-rose-crest{color:#b22520 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"阿露艾露玛\"], [data-char^=\"阿露艾露玛·\"]) .custom-nvn-name-plate{border-left:3px solid #b22520 !important;border-top:1px solid rgba(178, 37, 32,0.35) !important;border-bottom:1px solid rgba(178, 37, 32,0.35) !important;background:linear-gradient(90deg, rgba(178, 37, 32,0.22) 0%, rgba(178, 37, 32,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"阿皮洛・拉戈斯\"], [data-char^=\"阿皮洛・拉戈斯·\"]) .custom-nvn-name-initial{color:#5d4fc4 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"阿皮洛・拉戈斯\"], [data-char^=\"阿皮洛・拉戈斯·\"]) .custom-nvn-rose-crest{color:#5d4fc4 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"阿皮洛・拉戈斯\"], [data-char^=\"阿皮洛・拉戈斯·\"]) .custom-nvn-name-plate{border-left:3px solid #5d4fc4 !important;border-top:1px solid rgba(93, 79, 196,0.35) !important;border-bottom:1px solid rgba(93, 79, 196,0.35) !important;background:linear-gradient(90deg, rgba(93, 79, 196,0.22) 0%, rgba(93, 79, 196,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"阿斯塔洛特\"], [data-char^=\"阿斯塔洛特·\"]) .custom-nvn-name-initial{color:#e03c47 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"阿斯塔洛特\"], [data-char^=\"阿斯塔洛特·\"]) .custom-nvn-rose-crest{color:#e03c47 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"阿斯塔洛特\"], [data-char^=\"阿斯塔洛特·\"]) .custom-nvn-name-plate{border-left:3px solid #e03c47 !important;border-top:1px solid rgba(224, 60, 71,0.35) !important;border-bottom:1px solid rgba(224, 60, 71,0.35) !important;background:linear-gradient(90deg, rgba(224, 60, 71,0.22) 0%, rgba(224, 60, 71,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"艾克斯・索尼娅\"], [data-char^=\"艾克斯・索尼娅·\"]) .custom-nvn-name-initial{color:#e09831 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"艾克斯・索尼娅\"], [data-char^=\"艾克斯・索尼娅·\"]) .custom-nvn-rose-crest{color:#e09831 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"艾克斯・索尼娅\"], [data-char^=\"艾克斯・索尼娅·\"]) .custom-nvn-name-plate{border-left:3px solid #e09831 !important;border-top:1px solid rgba(224, 152, 49,0.35) !important;border-bottom:1px solid rgba(224, 152, 49,0.35) !important;background:linear-gradient(90deg, rgba(224, 152, 49,0.22) 0%, rgba(224, 152, 49,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"艾丽丝\"], [data-char^=\"艾丽丝·\"]) .custom-nvn-name-initial{color:#bc2c21 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"艾丽丝\"], [data-char^=\"艾丽丝·\"]) .custom-nvn-rose-crest{color:#bc2c21 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"艾丽丝\"], [data-char^=\"艾丽丝·\"]) .custom-nvn-name-plate{border-left:3px solid #bc2c21 !important;border-top:1px solid rgba(188, 44, 33,0.35) !important;border-bottom:1px solid rgba(188, 44, 33,0.35) !important;background:linear-gradient(90deg, rgba(188, 44, 33,0.22) 0%, rgba(188, 44, 33,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"艾丽丝菲兹3世\"], [data-char^=\"艾丽丝菲兹3世·\"]) .custom-nvn-name-initial{color:#4674b2 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"艾丽丝菲兹3世\"], [data-char^=\"艾丽丝菲兹3世·\"]) .custom-nvn-rose-crest{color:#4674b2 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"艾丽丝菲兹3世\"], [data-char^=\"艾丽丝菲兹3世·\"]) .custom-nvn-name-plate{border-left:3px solid #4674b2 !important;border-top:1px solid rgba(70, 116, 178,0.35) !important;border-bottom:1px solid rgba(70, 116, 178,0.35) !important;background:linear-gradient(90deg, rgba(70, 116, 178,0.22) 0%, rgba(70, 116, 178,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"艾丽丝菲兹4世\"], [data-char^=\"艾丽丝菲兹4世·\"]) .custom-nvn-name-initial{color:#e028d0 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"艾丽丝菲兹4世\"], [data-char^=\"艾丽丝菲兹4世·\"]) .custom-nvn-rose-crest{color:#e028d0 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"艾丽丝菲兹4世\"], [data-char^=\"艾丽丝菲兹4世·\"]) .custom-nvn-name-plate{border-left:3px solid #e028d0 !important;border-top:1px solid rgba(224, 40, 208,0.35) !important;border-bottom:1px solid rgba(224, 40, 208,0.35) !important;background:linear-gradient(90deg, rgba(224, 40, 208,0.22) 0%, rgba(224, 40, 208,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"艾丽丝菲兹10世\"], [data-char^=\"艾丽丝菲兹10世·\"]) .custom-nvn-name-initial{color:#b22041 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"艾丽丝菲兹10世\"], [data-char^=\"艾丽丝菲兹10世·\"]) .custom-nvn-rose-crest{color:#b22041 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"艾丽丝菲兹10世\"], [data-char^=\"艾丽丝菲兹10世·\"]) .custom-nvn-name-plate{border-left:3px solid #b22041 !important;border-top:1px solid rgba(178, 32, 65,0.35) !important;border-bottom:1px solid rgba(178, 32, 65,0.35) !important;background:linear-gradient(90deg, rgba(178, 32, 65,0.22) 0%, rgba(178, 32, 65,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"艾丽丝菲兹15世\"], [data-char^=\"艾丽丝菲兹15世·\"]) .custom-nvn-name-initial{color:#a220b2 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"艾丽丝菲兹15世\"], [data-char^=\"艾丽丝菲兹15世·\"]) .custom-nvn-rose-crest{color:#a220b2 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"艾丽丝菲兹15世\"], [data-char^=\"艾丽丝菲兹15世·\"]) .custom-nvn-name-plate{border-left:3px solid #a220b2 !important;border-top:1px solid rgba(162, 32, 178,0.35) !important;border-bottom:1px solid rgba(162, 32, 178,0.35) !important;background:linear-gradient(90deg, rgba(162, 32, 178,0.22) 0%, rgba(162, 32, 178,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"艾露贝提耶\"], [data-char^=\"艾露贝提耶·\"]) .custom-nvn-name-initial{color:#274dd8 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"艾露贝提耶\"], [data-char^=\"艾露贝提耶·\"]) .custom-nvn-rose-crest{color:#274dd8 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"艾露贝提耶\"], [data-char^=\"艾露贝提耶·\"]) .custom-nvn-name-plate{border-left:3px solid #274dd8 !important;border-top:1px solid rgba(39, 77, 216,0.35) !important;border-bottom:1px solid rgba(39, 77, 216,0.35) !important;background:linear-gradient(90deg, rgba(39, 77, 216,0.22) 0%, rgba(39, 77, 216,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"白兔\"], [data-char^=\"白兔·\"]) .custom-nvn-name-initial{color:#603ce0 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"白兔\"], [data-char^=\"白兔·\"]) .custom-nvn-rose-crest{color:#603ce0 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"白兔\"], [data-char^=\"白兔·\"]) .custom-nvn-name-plate{border-left:3px solid #603ce0 !important;border-top:1px solid rgba(96, 60, 224,0.35) !important;border-bottom:1px solid rgba(96, 60, 224,0.35) !important;background:linear-gradient(90deg, rgba(96, 60, 224,0.22) 0%, rgba(96, 60, 224,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"法蒂玛\"], [data-char^=\"法蒂玛·\"]) .custom-nvn-name-initial{color:#b24420 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"法蒂玛\"], [data-char^=\"法蒂玛·\"]) .custom-nvn-rose-crest{color:#b24420 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"法蒂玛\"], [data-char^=\"法蒂玛·\"]) .custom-nvn-name-plate{border-left:3px solid #b24420 !important;border-top:1px solid rgba(178, 68, 32,0.35) !important;border-bottom:1px solid rgba(178, 68, 32,0.35) !important;background:linear-gradient(90deg, rgba(178, 68, 32,0.22) 0%, rgba(178, 68, 32,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"格诺西丝\"], [data-char^=\"格诺西丝·\"]) .custom-nvn-name-initial{color:#28e096 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"格诺西丝\"], [data-char^=\"格诺西丝·\"]) .custom-nvn-rose-crest{color:#28e096 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"格诺西丝\"], [data-char^=\"格诺西丝·\"]) .custom-nvn-name-plate{border-left:3px solid #28e096 !important;border-top:1px solid rgba(40, 224, 150,0.35) !important;border-bottom:1px solid rgba(40, 224, 150,0.35) !important;background:linear-gradient(90deg, rgba(40, 224, 150,0.22) 0%, rgba(40, 224, 150,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"古兰贝莉娅\"], [data-char^=\"古兰贝莉娅·\"]) .custom-nvn-name-initial{color:#e06864 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"古兰贝莉娅\"], [data-char^=\"古兰贝莉娅·\"]) .custom-nvn-rose-crest{color:#e06864 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"古兰贝莉娅\"], [data-char^=\"古兰贝莉娅·\"]) .custom-nvn-name-plate{border-left:3px solid #e06864 !important;border-top:1px solid rgba(224, 104, 100,0.35) !important;border-bottom:1px solid rgba(224, 104, 100,0.35) !important;background:linear-gradient(90deg, rgba(224, 104, 100,0.22) 0%, rgba(224, 104, 100,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"黑之艾丽丝\"], [data-char^=\"黑之艾丽丝·\"]) .custom-nvn-name-initial{color:#a7bd55 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"黑之艾丽丝\"], [data-char^=\"黑之艾丽丝·\"]) .custom-nvn-rose-crest{color:#a7bd55 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"黑之艾丽丝\"], [data-char^=\"黑之艾丽丝·\"]) .custom-nvn-name-plate{border-left:3px solid #a7bd55 !important;border-top:1px solid rgba(167, 189, 85,0.35) !important;border-bottom:1px solid rgba(167, 189, 85,0.35) !important;background:linear-gradient(90deg, rgba(167, 189, 85,0.22) 0%, rgba(167, 189, 85,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"机械降神\"], [data-char^=\"机械降神·\"]) .custom-nvn-name-initial{color:#90da27 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"机械降神\"], [data-char^=\"机械降神·\"]) .custom-nvn-rose-crest{color:#90da27 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"机械降神\"], [data-char^=\"机械降神·\"]) .custom-nvn-name-plate{border-left:3px solid #90da27 !important;border-top:1px solid rgba(144, 218, 39,0.35) !important;border-bottom:1px solid rgba(144, 218, 39,0.35) !important;background:linear-gradient(90deg, rgba(144, 218, 39,0.22) 0%, rgba(144, 218, 39,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"卡桑德拉\"], [data-char^=\"卡桑德拉·\"]) .custom-nvn-name-initial{color:#b23768 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"卡桑德拉\"], [data-char^=\"卡桑德拉·\"]) .custom-nvn-rose-crest{color:#b23768 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"卡桑德拉\"], [data-char^=\"卡桑德拉·\"]) .custom-nvn-name-plate{border-left:3px solid #b23768 !important;border-top:1px solid rgba(178, 55, 104,0.35) !important;border-bottom:1px solid rgba(178, 55, 104,0.35) !important;background:linear-gradient(90deg, rgba(178, 55, 104,0.22) 0%, rgba(178, 55, 104,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"克莱奥・阿德拉\"], [data-char^=\"克莱奥・阿德拉·\"]) .custom-nvn-name-initial{color:#cd8925 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"克莱奥・阿德拉\"], [data-char^=\"克莱奥・阿德拉·\"]) .custom-nvn-rose-crest{color:#cd8925 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"克莱奥・阿德拉\"], [data-char^=\"克莱奥・阿德拉·\"]) .custom-nvn-name-plate{border-left:3px solid #cd8925 !important;border-top:1px solid rgba(205, 137, 37,0.35) !important;border-bottom:1px solid rgba(205, 137, 37,0.35) !important;background:linear-gradient(90deg, rgba(205, 137, 37,0.22) 0%, rgba(205, 137, 37,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"拉斐艾拉\"], [data-char^=\"拉斐艾拉·\"]) .custom-nvn-name-initial{color:#e0ce28 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"拉斐艾拉\"], [data-char^=\"拉斐艾拉·\"]) .custom-nvn-rose-crest{color:#e0ce28 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"拉斐艾拉\"], [data-char^=\"拉斐艾拉·\"]) .custom-nvn-name-plate{border-left:3px solid #e0ce28 !important;border-top:1px solid rgba(224, 206, 40,0.35) !important;border-bottom:1px solid rgba(224, 206, 40,0.35) !important;background:linear-gradient(90deg, rgba(224, 206, 40,0.22) 0%, rgba(224, 206, 40,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"莉莉丝\"], [data-char^=\"莉莉丝·\"]) .custom-nvn-name-initial{color:#c264e0 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"莉莉丝\"], [data-char^=\"莉莉丝·\"]) .custom-nvn-rose-crest{color:#c264e0 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"莉莉丝\"], [data-char^=\"莉莉丝·\"]) .custom-nvn-name-plate{border-left:3px solid #c264e0 !important;border-top:1px solid rgba(194, 100, 224,0.35) !important;border-bottom:1px solid rgba(194, 100, 224,0.35) !important;background:linear-gradient(90deg, rgba(194, 100, 224,0.22) 0%, rgba(194, 100, 224,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"鲁卡\"], [data-char^=\"鲁卡·\"]) .custom-nvn-name-initial{color:#b26a50 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"鲁卡\"], [data-char^=\"鲁卡·\"]) .custom-nvn-rose-crest{color:#b26a50 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"鲁卡\"], [data-char^=\"鲁卡·\"]) .custom-nvn-name-plate{border-left:3px solid #b26a50 !important;border-top:1px solid rgba(178, 106, 80,0.35) !important;border-bottom:1px solid rgba(178, 106, 80,0.35) !important;background:linear-gradient(90deg, rgba(178, 106, 80,0.22) 0%, rgba(178, 106, 80,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"路西菲娜\"], [data-char^=\"路西菲娜·\"]) .custom-nvn-name-initial{color:#b37850 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"路西菲娜\"], [data-char^=\"路西菲娜·\"]) .custom-nvn-rose-crest{color:#b37850 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"路西菲娜\"], [data-char^=\"路西菲娜·\"]) .custom-nvn-name-plate{border-left:3px solid #b37850 !important;border-top:1px solid rgba(179, 120, 80,0.35) !important;border-bottom:1px solid rgba(179, 120, 80,0.35) !important;background:linear-gradient(90deg, rgba(179, 120, 80,0.22) 0%, rgba(179, 120, 80,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"马鲁塞勒斯\"], [data-char^=\"马鲁塞勒斯·\"]) .custom-nvn-name-initial{color:#b2502f !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"马鲁塞勒斯\"], [data-char^=\"马鲁塞勒斯·\"]) .custom-nvn-rose-crest{color:#b2502f !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"马鲁塞勒斯\"], [data-char^=\"马鲁塞勒斯·\"]) .custom-nvn-name-plate{border-left:3px solid #b2502f !important;border-top:1px solid rgba(178, 80, 47,0.35) !important;border-bottom:1px solid rgba(178, 80, 47,0.35) !important;background:linear-gradient(90deg, rgba(178, 80, 47,0.22) 0%, rgba(178, 80, 47,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"梅菲斯特\"], [data-char^=\"梅菲斯特·\"]) .custom-nvn-name-initial{color:#b29a47 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"梅菲斯特\"], [data-char^=\"梅菲斯特·\"]) .custom-nvn-rose-crest{color:#b29a47 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"梅菲斯特\"], [data-char^=\"梅菲斯特·\"]) .custom-nvn-name-plate{border-left:3px solid #b29a47 !important;border-top:1px solid rgba(178, 154, 71,0.35) !important;border-bottom:1px solid rgba(178, 154, 71,0.35) !important;background:linear-gradient(90deg, rgba(178, 154, 71,0.22) 0%, rgba(178, 154, 71,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"米迦艾拉\"], [data-char^=\"米迦艾拉·\"]) .custom-nvn-name-initial{color:#e08664 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"米迦艾拉\"], [data-char^=\"米迦艾拉·\"]) .custom-nvn-rose-crest{color:#e08664 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"米迦艾拉\"], [data-char^=\"米迦艾拉·\"]) .custom-nvn-name-plate{border-left:3px solid #e08664 !important;border-top:1px solid rgba(224, 134, 100,0.35) !important;border-bottom:1px solid rgba(224, 134, 100,0.35) !important;background:linear-gradient(90deg, rgba(224, 134, 100,0.22) 0%, rgba(224, 134, 100,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"摩莉甘\"], [data-char^=\"摩莉甘·\"]) .custom-nvn-name-initial{color:#3aa4ca !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"摩莉甘\"], [data-char^=\"摩莉甘·\"]) .custom-nvn-rose-crest{color:#3aa4ca !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"摩莉甘\"], [data-char^=\"摩莉甘·\"]) .custom-nvn-name-plate{border-left:3px solid #3aa4ca !important;border-top:1px solid rgba(58, 164, 202,0.35) !important;border-bottom:1px solid rgba(58, 164, 202,0.35) !important;background:linear-gradient(90deg, rgba(58, 164, 202,0.22) 0%, rgba(58, 164, 202,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"尼菲特・泰罗斯\"], [data-char^=\"尼菲特・泰罗斯·\"]) .custom-nvn-name-initial{color:#b22120 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"尼菲特・泰罗斯\"], [data-char^=\"尼菲特・泰罗斯·\"]) .custom-nvn-rose-crest{color:#b22120 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"尼菲特・泰罗斯\"], [data-char^=\"尼菲特・泰罗斯·\"]) .custom-nvn-name-plate{border-left:3px solid #b22120 !important;border-top:1px solid rgba(178, 33, 32,0.35) !important;border-bottom:1px solid rgba(178, 33, 32,0.35) !important;background:linear-gradient(90deg, rgba(178, 33, 32,0.22) 0%, rgba(178, 33, 32,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"努尔・科吉托\"], [data-char^=\"努尔・科吉托·\"]) .custom-nvn-name-initial{color:#4423c3 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"努尔・科吉托\"], [data-char^=\"努尔・科吉托·\"]) .custom-nvn-rose-crest{color:#4423c3 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"努尔・科吉托\"], [data-char^=\"努尔・科吉托·\"]) .custom-nvn-name-plate{border-left:3px solid #4423c3 !important;border-top:1px solid rgba(68, 35, 195,0.35) !important;border-bottom:1px solid rgba(68, 35, 195,0.35) !important;background:linear-gradient(90deg, rgba(68, 35, 195,0.22) 0%, rgba(68, 35, 195,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"诺姆\"], [data-char^=\"诺姆·\"]) .custom-nvn-name-initial{color:#d49730 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"诺姆\"], [data-char^=\"诺姆·\"]) .custom-nvn-rose-crest{color:#d49730 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"诺姆\"], [data-char^=\"诺姆·\"]) .custom-nvn-name-plate{border-left:3px solid #d49730 !important;border-top:1px solid rgba(212, 151, 48,0.35) !important;border-bottom:1px solid rgba(212, 151, 48,0.35) !important;background:linear-gradient(90deg, rgba(212, 151, 48,0.22) 0%, rgba(212, 151, 48,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"胖次老师\"], [data-char^=\"胖次老师·\"]) .custom-nvn-name-initial{color:#b25d50 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"胖次老师\"], [data-char^=\"胖次老师·\"]) .custom-nvn-rose-crest{color:#b25d50 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"胖次老师\"], [data-char^=\"胖次老师·\"]) .custom-nvn-name-plate{border-left:3px solid #b25d50 !important;border-top:1px solid rgba(178, 93, 80,0.35) !important;border-bottom:1px solid rgba(178, 93, 80,0.35) !important;background:linear-gradient(90deg, rgba(178, 93, 80,0.22) 0%, rgba(178, 93, 80,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"普罗米斯汀\"], [data-char^=\"普罗米斯汀·\"]) .custom-nvn-name-initial{color:#b22244 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"普罗米斯汀\"], [data-char^=\"普罗米斯汀·\"]) .custom-nvn-rose-crest{color:#b22244 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"普罗米斯汀\"], [data-char^=\"普罗米斯汀·\"]) .custom-nvn-name-plate{border-left:3px solid #b22244 !important;border-top:1px solid rgba(178, 34, 68,0.35) !important;border-bottom:1px solid rgba(178, 34, 68,0.35) !important;background:linear-gradient(90deg, rgba(178, 34, 68,0.22) 0%, rgba(178, 34, 68,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"萨拉曼达\"], [data-char^=\"萨拉曼达·\"]) .custom-nvn-name-initial{color:#e05241 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"萨拉曼达\"], [data-char^=\"萨拉曼达·\"]) .custom-nvn-rose-crest{color:#e05241 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"萨拉曼达\"], [data-char^=\"萨拉曼达·\"]) .custom-nvn-name-plate{border-left:3px solid #e05241 !important;border-top:1px solid rgba(224, 82, 65,0.35) !important;border-bottom:1px solid rgba(224, 82, 65,0.35) !important;background:linear-gradient(90deg, rgba(224, 82, 65,0.22) 0%, rgba(224, 82, 65,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"沙蛇\"], [data-char^=\"沙蛇·\"]) .custom-nvn-name-initial{color:#b27a4f !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"沙蛇\"], [data-char^=\"沙蛇·\"]) .custom-nvn-rose-crest{color:#b27a4f !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"沙蛇\"], [data-char^=\"沙蛇·\"]) .custom-nvn-name-plate{border-left:3px solid #b27a4f !important;border-top:1px solid rgba(178, 122, 79,0.35) !important;border-bottom:1px solid rgba(178, 122, 79,0.35) !important;background:linear-gradient(90deg, rgba(178, 122, 79,0.22) 0%, rgba(178, 122, 79,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"圣·伊莉娅王\"], [data-char^=\"圣·伊莉娅王·\"]) .custom-nvn-name-initial{color:#b5772a !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"圣·伊莉娅王\"], [data-char^=\"圣·伊莉娅王·\"]) .custom-nvn-rose-crest{color:#b5772a !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"圣·伊莉娅王\"], [data-char^=\"圣·伊莉娅王·\"]) .custom-nvn-name-plate{border-left:3px solid #b5772a !important;border-top:1px solid rgba(181, 119, 42,0.35) !important;border-bottom:1px solid rgba(181, 119, 42,0.35) !important;background:linear-gradient(90deg, rgba(181, 119, 42,0.22) 0%, rgba(181, 119, 42,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"死神\"], [data-char^=\"死神·\"]) .custom-nvn-name-initial{color:#d12531 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"死神\"], [data-char^=\"死神·\"]) .custom-nvn-rose-crest{color:#d12531 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"死神\"], [data-char^=\"死神·\"]) .custom-nvn-name-plate{border-left:3px solid #d12531 !important;border-top:1px solid rgba(209, 37, 49,0.35) !important;border-bottom:1px solid rgba(209, 37, 49,0.35) !important;background:linear-gradient(90deg, rgba(209, 37, 49,0.22) 0%, rgba(209, 37, 49,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"索尼娅\"], [data-char^=\"索尼娅·\"]) .custom-nvn-name-initial{color:#ce7b47 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"索尼娅\"], [data-char^=\"索尼娅·\"]) .custom-nvn-rose-crest{color:#ce7b47 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"索尼娅\"], [data-char^=\"索尼娅·\"]) .custom-nvn-name-plate{border-left:3px solid #ce7b47 !important;border-top:1px solid rgba(206, 123, 71,0.35) !important;border-bottom:1px solid rgba(206, 123, 71,0.35) !important;background:linear-gradient(90deg, rgba(206, 123, 71,0.22) 0%, rgba(206, 123, 71,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"温蒂妮\"], [data-char^=\"温蒂妮·\"]) .custom-nvn-name-initial{color:#6484e0 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"温蒂妮\"], [data-char^=\"温蒂妮·\"]) .custom-nvn-rose-crest{color:#6484e0 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"温蒂妮\"], [data-char^=\"温蒂妮·\"]) .custom-nvn-name-plate{border-left:3px solid #6484e0 !important;border-top:1px solid rgba(100, 132, 224,0.35) !important;border-bottom:1px solid rgba(100, 132, 224,0.35) !important;background:linear-gradient(90deg, rgba(100, 132, 224,0.22) 0%, rgba(100, 132, 224,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"希尔芙\"], [data-char^=\"希尔芙·\"]) .custom-nvn-name-initial{color:#b77a20 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"希尔芙\"], [data-char^=\"希尔芙·\"]) .custom-nvn-rose-crest{color:#b77a20 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"希尔芙\"], [data-char^=\"希尔芙·\"]) .custom-nvn-name-plate{border-left:3px solid #b77a20 !important;border-top:1px solid rgba(183, 122, 32,0.35) !important;border-bottom:1px solid rgba(183, 122, 32,0.35) !important;background:linear-gradient(90deg, rgba(183, 122, 32,0.22) 0%, rgba(183, 122, 32,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"锡安\"], [data-char^=\"锡安·\"]) .custom-nvn-name-initial{color:#b22040 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"锡安\"], [data-char^=\"锡安·\"]) .custom-nvn-rose-crest{color:#b22040 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"锡安\"], [data-char^=\"锡安·\"]) .custom-nvn-name-plate{border-left:3px solid #b22040 !important;border-top:1px solid rgba(178, 32, 64,0.35) !important;border-bottom:1px solid rgba(178, 32, 64,0.35) !important;background:linear-gradient(90deg, rgba(178, 32, 64,0.22) 0%, rgba(178, 32, 64,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"伊迪亚・鲁卡斯\"], [data-char^=\"伊迪亚・鲁卡斯·\"]) .custom-nvn-name-initial{color:#7950b2 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"伊迪亚・鲁卡斯\"], [data-char^=\"伊迪亚・鲁卡斯·\"]) .custom-nvn-rose-crest{color:#7950b2 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"伊迪亚・鲁卡斯\"], [data-char^=\"伊迪亚・鲁卡斯·\"]) .custom-nvn-name-plate{border-left:3px solid #7950b2 !important;border-top:1px solid rgba(121, 80, 178,0.35) !important;border-bottom:1px solid rgba(121, 80, 178,0.35) !important;background:linear-gradient(90deg, rgba(121, 80, 178,0.22) 0%, rgba(121, 80, 178,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"伊甸\"], [data-char^=\"伊甸·\"]) .custom-nvn-name-initial{color:#2973b2 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"伊甸\"], [data-char^=\"伊甸·\"]) .custom-nvn-rose-crest{color:#2973b2 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"伊甸\"], [data-char^=\"伊甸·\"]) .custom-nvn-name-plate{border-left:3px solid #2973b2 !important;border-top:1px solid rgba(41, 115, 178,0.35) !important;border-bottom:1px solid rgba(41, 115, 178,0.35) !important;background:linear-gradient(90deg, rgba(41, 115, 178,0.22) 0%, rgba(41, 115, 178,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"伊莉娅丝\"], [data-char^=\"伊莉娅丝·\"]) .custom-nvn-name-initial{color:#e09a64 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"伊莉娅丝\"], [data-char^=\"伊莉娅丝·\"]) .custom-nvn-rose-crest{color:#e09a64 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"伊莉娅丝\"], [data-char^=\"伊莉娅丝·\"]) .custom-nvn-name-plate{border-left:3px solid #e09a64 !important;border-top:1px solid rgba(224, 154, 100,0.35) !important;border-bottom:1px solid rgba(224, 154, 100,0.35) !important;background:linear-gradient(90deg, rgba(224, 154, 100,0.22) 0%, rgba(224, 154, 100,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"影䌷\"], [data-char^=\"影䌷·\"]) .custom-nvn-name-initial{color:#b2404d !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"影䌷\"], [data-char^=\"影䌷·\"]) .custom-nvn-rose-crest{color:#b2404d !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"影䌷\"], [data-char^=\"影䌷·\"]) .custom-nvn-name-plate{border-left:3px solid #b2404d !important;border-top:1px solid rgba(178, 64, 77,0.35) !important;border-bottom:1px solid rgba(178, 64, 77,0.35) !important;background:linear-gradient(90deg, rgba(178, 64, 77,0.22) 0%, rgba(178, 64, 77,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"宇宙神蝶\"], [data-char^=\"宇宙神蝶·\"]) .custom-nvn-name-initial{color:#b2506b !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"宇宙神蝶\"], [data-char^=\"宇宙神蝶·\"]) .custom-nvn-rose-crest{color:#b2506b !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"宇宙神蝶\"], [data-char^=\"宇宙神蝶·\"]) .custom-nvn-name-plate{border-left:3px solid #b2506b !important;border-top:1px solid rgba(178, 80, 107,0.35) !important;border-bottom:1px solid rgba(178, 80, 107,0.35) !important;background:linear-gradient(90deg, rgba(178, 80, 107,0.22) 0%, rgba(178, 80, 107,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"玉藻\"], [data-char^=\"玉藻·\"]) .custom-nvn-name-initial{color:#e08546 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"玉藻\"], [data-char^=\"玉藻·\"]) .custom-nvn-rose-crest{color:#e08546 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"玉藻\"], [data-char^=\"玉藻·\"]) .custom-nvn-name-plate{border-left:3px solid #e08546 !important;border-top:1px solid rgba(224, 133, 70,0.35) !important;border-bottom:1px solid rgba(224, 133, 70,0.35) !important;background:linear-gradient(90deg, rgba(224, 133, 70,0.22) 0%, rgba(224, 133, 70,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"尼克丝\"], [data-char^=\"尼克丝·\"]) .custom-nvn-name-initial{color:#b23455 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"尼克丝\"], [data-char^=\"尼克丝·\"]) .custom-nvn-rose-crest{color:#b23455 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"尼克丝\"], [data-char^=\"尼克丝·\"]) .custom-nvn-name-plate{border-left:3px solid #b23455 !important;border-top:1px solid rgba(178, 52, 85,0.35) !important;border-bottom:1px solid rgba(178, 52, 85,0.35) !important;background:linear-gradient(90deg, rgba(178, 52, 85,0.22) 0%, rgba(178, 52, 85,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"莉莉雅\"], [data-char^=\"莉莉雅·\"]) .custom-nvn-name-initial{color:#5055b2 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"莉莉雅\"], [data-char^=\"莉莉雅·\"]) .custom-nvn-rose-crest{color:#5055b2 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"莉莉雅\"], [data-char^=\"莉莉雅·\"]) .custom-nvn-name-plate{border-left:3px solid #5055b2 !important;border-top:1px solid rgba(80, 85, 178,0.35) !important;border-bottom:1px solid rgba(80, 85, 178,0.35) !important;background:linear-gradient(90deg, rgba(80, 85, 178,0.22) 0%, rgba(80, 85, 178,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"克拉尔\"], [data-char^=\"克拉尔·\"]) .custom-nvn-name-initial{color:#e08864 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"克拉尔\"], [data-char^=\"克拉尔·\"]) .custom-nvn-rose-crest{color:#e08864 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"克拉尔\"], [data-char^=\"克拉尔·\"]) .custom-nvn-name-plate{border-left:3px solid #e08864 !important;border-top:1px solid rgba(224, 136, 100,0.35) !important;border-bottom:1px solid rgba(224, 136, 100,0.35) !important;background:linear-gradient(90deg, rgba(224, 136, 100,0.22) 0%, rgba(224, 136, 100,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"蕾库\"], [data-char^=\"蕾库·\"]) .custom-nvn-name-initial{color:#b28e20 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"蕾库\"], [data-char^=\"蕾库·\"]) .custom-nvn-rose-crest{color:#b28e20 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"蕾库\"], [data-char^=\"蕾库·\"]) .custom-nvn-name-plate{border-left:3px solid #b28e20 !important;border-top:1px solid rgba(178, 142, 32,0.35) !important;border-bottom:1px solid rgba(178, 142, 32,0.35) !important;background:linear-gradient(90deg, rgba(178, 142, 32,0.22) 0%, rgba(178, 142, 32,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"玛莉亚\"], [data-char^=\"玛莉亚·\"]) .custom-nvn-name-initial{color:#c95ab2 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"玛莉亚\"], [data-char^=\"玛莉亚·\"]) .custom-nvn-rose-crest{color:#c95ab2 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"玛莉亚\"], [data-char^=\"玛莉亚·\"]) .custom-nvn-name-plate{border-left:3px solid #c95ab2 !important;border-top:1px solid rgba(201, 90, 178,0.35) !important;border-bottom:1px solid rgba(201, 90, 178,0.35) !important;background:linear-gradient(90deg, rgba(201, 90, 178,0.22) 0%, rgba(201, 90, 178,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"纳兹娜\"], [data-char^=\"纳兹娜·\"]) .custom-nvn-name-initial{color:#b22020 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"纳兹娜\"], [data-char^=\"纳兹娜·\"]) .custom-nvn-rose-crest{color:#b22020 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"纳兹娜\"], [data-char^=\"纳兹娜·\"]) .custom-nvn-name-plate{border-left:3px solid #b22020 !important;border-top:1px solid rgba(178, 32, 32,0.35) !important;border-bottom:1px solid rgba(178, 32, 32,0.35) !important;background:linear-gradient(90deg, rgba(178, 32, 32,0.22) 0%, rgba(178, 32, 32,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"皮丽拉\"], [data-char^=\"皮丽拉·\"]) .custom-nvn-name-initial{color:#dcbb5c !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"皮丽拉\"], [data-char^=\"皮丽拉·\"]) .custom-nvn-rose-crest{color:#dcbb5c !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"皮丽拉\"], [data-char^=\"皮丽拉·\"]) .custom-nvn-name-plate{border-left:3px solid #dcbb5c !important;border-top:1px solid rgba(220, 187, 92,0.35) !important;border-bottom:1px solid rgba(220, 187, 92,0.35) !important;background:linear-gradient(90deg, rgba(220, 187, 92,0.22) 0%, rgba(220, 187, 92,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"茜拉\"], [data-char^=\"茜拉·\"]) .custom-nvn-name-initial{color:#e0c064 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"茜拉\"], [data-char^=\"茜拉·\"]) .custom-nvn-rose-crest{color:#e0c064 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"茜拉\"], [data-char^=\"茜拉·\"]) .custom-nvn-name-plate{border-left:3px solid #e0c064 !important;border-top:1px solid rgba(224, 192, 100,0.35) !important;border-bottom:1px solid rgba(224, 192, 100,0.35) !important;background:linear-gradient(90deg, rgba(224, 192, 100,0.22) 0%, rgba(224, 192, 100,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"缇蕾玛\"], [data-char^=\"缇蕾玛·\"]) .custom-nvn-name-initial{color:#b25950 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"缇蕾玛\"], [data-char^=\"缇蕾玛·\"]) .custom-nvn-rose-crest{color:#b25950 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"缇蕾玛\"], [data-char^=\"缇蕾玛·\"]) .custom-nvn-name-plate{border-left:3px solid #b25950 !important;border-top:1px solid rgba(178, 89, 80,0.35) !important;border-bottom:1px solid rgba(178, 89, 80,0.35) !important;background:linear-gradient(90deg, rgba(178, 89, 80,0.22) 0%, rgba(178, 89, 80,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"乌菈\"], [data-char^=\"乌菈·\"]) .custom-nvn-name-initial{color:#4ab29d !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"乌菈\"], [data-char^=\"乌菈·\"]) .custom-nvn-rose-crest{color:#4ab29d !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"乌菈\"], [data-char^=\"乌菈·\"]) .custom-nvn-name-plate{border-left:3px solid #4ab29d !important;border-top:1px solid rgba(74, 178, 157,0.35) !important;border-bottom:1px solid rgba(74, 178, 157,0.35) !important;background:linear-gradient(90deg, rgba(74, 178, 157,0.22) 0%, rgba(74, 178, 157,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"雪娜\"], [data-char^=\"雪娜·\"]) .custom-nvn-name-initial{color:#40a8b2 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"雪娜\"], [data-char^=\"雪娜·\"]) .custom-nvn-rose-crest{color:#40a8b2 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"雪娜\"], [data-char^=\"雪娜·\"]) .custom-nvn-name-plate{border-left:3px solid #40a8b2 !important;border-top:1px solid rgba(64, 168, 178,0.35) !important;border-bottom:1px solid rgba(64, 168, 178,0.35) !important;background:linear-gradient(90deg, rgba(64, 168, 178,0.22) 0%, rgba(64, 168, 178,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"艾梅拉\"], [data-char^=\"艾梅拉·\"]) .custom-nvn-name-initial{color:#d34047 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"艾梅拉\"], [data-char^=\"艾梅拉·\"]) .custom-nvn-rose-crest{color:#d34047 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"艾梅拉\"], [data-char^=\"艾梅拉·\"]) .custom-nvn-name-plate{border-left:3px solid #d34047 !important;border-top:1px solid rgba(211, 64, 71,0.35) !important;border-bottom:1px solid rgba(211, 64, 71,0.35) !important;background:linear-gradient(90deg, rgba(211, 64, 71,0.22) 0%, rgba(211, 64, 71,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"凯米迦\"], [data-char^=\"凯米迦·\"]) .custom-nvn-name-initial{color:#9950b3 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"凯米迦\"], [data-char^=\"凯米迦·\"]) .custom-nvn-rose-crest{color:#9950b3 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"凯米迦\"], [data-char^=\"凯米迦·\"]) .custom-nvn-name-plate{border-left:3px solid #9950b3 !important;border-top:1px solid rgba(153, 80, 179,0.35) !important;border-bottom:1px solid rgba(153, 80, 179,0.35) !important;background:linear-gradient(90deg, rgba(153, 80, 179,0.22) 0%, rgba(153, 80, 179,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"库卢哈\"], [data-char^=\"库卢哈·\"]) .custom-nvn-name-initial{color:#b25b20 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"库卢哈\"], [data-char^=\"库卢哈·\"]) .custom-nvn-rose-crest{color:#b25b20 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"库卢哈\"], [data-char^=\"库卢哈·\"]) .custom-nvn-name-plate{border-left:3px solid #b25b20 !important;border-top:1px solid rgba(178, 91, 32,0.35) !important;border-bottom:1px solid rgba(178, 91, 32,0.35) !important;background:linear-gradient(90deg, rgba(178, 91, 32,0.22) 0%, rgba(178, 91, 32,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"拉比\"], [data-char^=\"拉比·\"]) .custom-nvn-name-initial{color:#e02855 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"拉比\"], [data-char^=\"拉比·\"]) .custom-nvn-rose-crest{color:#e02855 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"拉比\"], [data-char^=\"拉比·\"]) .custom-nvn-name-plate{border-left:3px solid #e02855 !important;border-top:1px solid rgba(224, 40, 85,0.35) !important;border-bottom:1px solid rgba(224, 40, 85,0.35) !important;background:linear-gradient(90deg, rgba(224, 40, 85,0.22) 0%, rgba(224, 40, 85,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"蕾斯缇亚\"], [data-char^=\"蕾斯缇亚·\"]) .custom-nvn-name-initial{color:#b2554c !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"蕾斯缇亚\"], [data-char^=\"蕾斯缇亚·\"]) .custom-nvn-rose-crest{color:#b2554c !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"蕾斯缇亚\"], [data-char^=\"蕾斯缇亚·\"]) .custom-nvn-name-plate{border-left:3px solid #b2554c !important;border-top:1px solid rgba(178, 85, 76,0.35) !important;border-bottom:1px solid rgba(178, 85, 76,0.35) !important;background:linear-gradient(90deg, rgba(178, 85, 76,0.22) 0%, rgba(178, 85, 76,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"欧里丝\"], [data-char^=\"欧里丝·\"]) .custom-nvn-name-initial{color:#63b7dd !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"欧里丝\"], [data-char^=\"欧里丝·\"]) .custom-nvn-rose-crest{color:#63b7dd !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"欧里丝\"], [data-char^=\"欧里丝·\"]) .custom-nvn-name-plate{border-left:3px solid #63b7dd !important;border-top:1px solid rgba(99, 183, 221,0.35) !important;border-bottom:1px solid rgba(99, 183, 221,0.35) !important;background:linear-gradient(90deg, rgba(99, 183, 221,0.22) 0%, rgba(99, 183, 221,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"奥莉维亚\"], [data-char^=\"奥莉维亚·\"]) .custom-nvn-name-initial{color:#285fb2 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"奥莉维亚\"], [data-char^=\"奥莉维亚·\"]) .custom-nvn-rose-crest{color:#285fb2 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"奥莉维亚\"], [data-char^=\"奥莉维亚·\"]) .custom-nvn-name-plate{border-left:3px solid #285fb2 !important;border-top:1px solid rgba(40, 95, 178,0.35) !important;border-bottom:1px solid rgba(40, 95, 178,0.35) !important;background:linear-gradient(90deg, rgba(40, 95, 178,0.22) 0%, rgba(40, 95, 178,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"蒂塔\"], [data-char^=\"蒂塔·\"]) .custom-nvn-name-initial{color:#b2204e !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"蒂塔\"], [data-char^=\"蒂塔·\"]) .custom-nvn-rose-crest{color:#b2204e !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"蒂塔\"], [data-char^=\"蒂塔·\"]) .custom-nvn-name-plate{border-left:3px solid #b2204e !important;border-top:1px solid rgba(178, 32, 78,0.35) !important;border-bottom:1px solid rgba(178, 32, 78,0.35) !important;background:linear-gradient(90deg, rgba(178, 32, 78,0.22) 0%, rgba(178, 32, 78,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"法莉亚\"], [data-char^=\"法莉亚·\"]) .custom-nvn-name-initial{color:#b25054 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"法莉亚\"], [data-char^=\"法莉亚·\"]) .custom-nvn-rose-crest{color:#b25054 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"法莉亚\"], [data-char^=\"法莉亚·\"]) .custom-nvn-name-plate{border-left:3px solid #b25054 !important;border-top:1px solid rgba(178, 80, 84,0.35) !important;border-bottom:1px solid rgba(178, 80, 84,0.35) !important;background:linear-gradient(90deg, rgba(178, 80, 84,0.22) 0%, rgba(178, 80, 84,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"库\"], [data-char^=\"库·\"]) .custom-nvn-name-initial{color:#3fbcbe !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"库\"], [data-char^=\"库·\"]) .custom-nvn-rose-crest{color:#3fbcbe !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"库\"], [data-char^=\"库·\"]) .custom-nvn-name-plate{border-left:3px solid #3fbcbe !important;border-top:1px solid rgba(63, 188, 190,0.35) !important;border-bottom:1px solid rgba(63, 188, 190,0.35) !important;background:linear-gradient(90deg, rgba(63, 188, 190,0.22) 0%, rgba(63, 188, 190,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"蕾达\"], [data-char^=\"蕾达·\"]) .custom-nvn-name-initial{color:#c82450 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"蕾达\"], [data-char^=\"蕾达·\"]) .custom-nvn-rose-crest{color:#c82450 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"蕾达\"], [data-char^=\"蕾达·\"]) .custom-nvn-name-plate{border-left:3px solid #c82450 !important;border-top:1px solid rgba(200, 36, 80,0.35) !important;border-bottom:1px solid rgba(200, 36, 80,0.35) !important;background:linear-gradient(90deg, rgba(200, 36, 80,0.22) 0%, rgba(200, 36, 80,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"露西卡\"], [data-char^=\"露西卡·\"]) .custom-nvn-name-initial{color:#b25332 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"露西卡\"], [data-char^=\"露西卡·\"]) .custom-nvn-rose-crest{color:#b25332 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"露西卡\"], [data-char^=\"露西卡·\"]) .custom-nvn-name-plate{border-left:3px solid #b25332 !important;border-top:1px solid rgba(178, 83, 50,0.35) !important;border-bottom:1px solid rgba(178, 83, 50,0.35) !important;background:linear-gradient(90deg, rgba(178, 83, 50,0.22) 0%, rgba(178, 83, 50,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"玛尼蒂\"], [data-char^=\"玛尼蒂·\"]) .custom-nvn-name-initial{color:#cb4e3a !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"玛尼蒂\"], [data-char^=\"玛尼蒂·\"]) .custom-nvn-rose-crest{color:#cb4e3a !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"玛尼蒂\"], [data-char^=\"玛尼蒂·\"]) .custom-nvn-name-plate{border-left:3px solid #cb4e3a !important;border-top:1px solid rgba(203, 78, 58,0.35) !important;border-bottom:1px solid rgba(203, 78, 58,0.35) !important;background:linear-gradient(90deg, rgba(203, 78, 58,0.22) 0%, rgba(203, 78, 58,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"维娜\"], [data-char^=\"维娜·\"]) .custom-nvn-name-initial{color:#e0aa64 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"维娜\"], [data-char^=\"维娜·\"]) .custom-nvn-rose-crest{color:#e0aa64 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"维娜\"], [data-char^=\"维娜·\"]) .custom-nvn-name-plate{border-left:3px solid #e0aa64 !important;border-top:1px solid rgba(224, 170, 100,0.35) !important;border-bottom:1px solid rgba(224, 170, 100,0.35) !important;background:linear-gradient(90deg, rgba(224, 170, 100,0.22) 0%, rgba(224, 170, 100,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"尤贝尔\"], [data-char^=\"尤贝尔·\"]) .custom-nvn-name-initial{color:#e0d264 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"尤贝尔\"], [data-char^=\"尤贝尔·\"]) .custom-nvn-rose-crest{color:#e0d264 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"尤贝尔\"], [data-char^=\"尤贝尔·\"]) .custom-nvn-name-plate{border-left:3px solid #e0d264 !important;border-top:1px solid rgba(224, 210, 100,0.35) !important;border-bottom:1px solid rgba(224, 210, 100,0.35) !important;background:linear-gradient(90deg, rgba(224, 210, 100,0.22) 0%, rgba(224, 210, 100,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"约尔娜娅\"], [data-char^=\"约尔娜娅·\"]) .custom-nvn-name-initial{color:#b25139 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"约尔娜娅\"], [data-char^=\"约尔娜娅·\"]) .custom-nvn-rose-crest{color:#b25139 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"约尔娜娅\"], [data-char^=\"约尔娜娅·\"]) .custom-nvn-name-plate{border-left:3px solid #b25139 !important;border-top:1px solid rgba(178, 81, 57,0.35) !important;border-bottom:1px solid rgba(178, 81, 57,0.35) !important;background:linear-gradient(90deg, rgba(178, 81, 57,0.22) 0%, rgba(178, 81, 57,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"优依\"], [data-char^=\"优依·\"]) .custom-nvn-name-initial{color:#5369ba !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"优依\"], [data-char^=\"优依·\"]) .custom-nvn-rose-crest{color:#5369ba !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"优依\"], [data-char^=\"优依·\"]) .custom-nvn-name-plate{border-left:3px solid #5369ba !important;border-top:1px solid rgba(83, 105, 186,0.35) !important;border-bottom:1px solid rgba(83, 105, 186,0.35) !important;background:linear-gradient(90deg, rgba(83, 105, 186,0.22) 0%, rgba(83, 105, 186,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"內伊\"], [data-char^=\"內伊·\"]) .custom-nvn-name-initial{color:#b85e36 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"內伊\"], [data-char^=\"內伊·\"]) .custom-nvn-rose-crest{color:#b85e36 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"內伊\"], [data-char^=\"內伊·\"]) .custom-nvn-name-plate{border-left:3px solid #b85e36 !important;border-top:1px solid rgba(184, 94, 54,0.35) !important;border-bottom:1px solid rgba(184, 94, 54,0.35) !important;background:linear-gradient(90deg, rgba(184, 94, 54,0.22) 0%, rgba(184, 94, 54,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"加兰哈德\"], [data-char^=\"加兰哈德·\"]) .custom-nvn-name-initial{color:#b2202f !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"加兰哈德\"], [data-char^=\"加兰哈德·\"]) .custom-nvn-rose-crest{color:#b2202f !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"加兰哈德\"], [data-char^=\"加兰哈德·\"]) .custom-nvn-name-plate{border-left:3px solid #b2202f !important;border-top:1px solid rgba(178, 32, 47,0.35) !important;border-bottom:1px solid rgba(178, 32, 47,0.35) !important;background:linear-gradient(90deg, rgba(178, 32, 47,0.22) 0%, rgba(178, 32, 47,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"尤克夏\"], [data-char^=\"尤克夏·\"]) .custom-nvn-name-initial{color:#c42360 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"尤克夏\"], [data-char^=\"尤克夏·\"]) .custom-nvn-rose-crest{color:#c42360 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"尤克夏\"], [data-char^=\"尤克夏·\"]) .custom-nvn-name-plate{border-left:3px solid #c42360 !important;border-top:1px solid rgba(196, 35, 96,0.35) !important;border-bottom:1px solid rgba(196, 35, 96,0.35) !important;background:linear-gradient(90deg, rgba(196, 35, 96,0.22) 0%, rgba(196, 35, 96,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"希利乌斯\"], [data-char^=\"希利乌斯·\"]) .custom-nvn-name-initial{color:#b25067 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"希利乌斯\"], [data-char^=\"希利乌斯·\"]) .custom-nvn-rose-crest{color:#b25067 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"希利乌斯\"], [data-char^=\"希利乌斯·\"]) .custom-nvn-name-plate{border-left:3px solid #b25067 !important;border-top:1px solid rgba(178, 80, 103,0.35) !important;border-bottom:1px solid rgba(178, 80, 103,0.35) !important;background:linear-gradient(90deg, rgba(178, 80, 103,0.22) 0%, rgba(178, 80, 103,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"戴安娜\"], [data-char^=\"戴安娜·\"]) .custom-nvn-name-initial{color:#6650b2 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"戴安娜\"], [data-char^=\"戴安娜·\"]) .custom-nvn-rose-crest{color:#6650b2 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"戴安娜\"], [data-char^=\"戴安娜·\"]) .custom-nvn-name-plate{border-left:3px solid #6650b2 !important;border-top:1px solid rgba(102, 80, 178,0.35) !important;border-bottom:1px solid rgba(102, 80, 178,0.35) !important;background:linear-gradient(90deg, rgba(102, 80, 178,0.22) 0%, rgba(102, 80, 178,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"琪琪露\"], [data-char^=\"琪琪露·\"]) .custom-nvn-name-initial{color:#e0b12e !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"琪琪露\"], [data-char^=\"琪琪露·\"]) .custom-nvn-rose-crest{color:#e0b12e !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"琪琪露\"], [data-char^=\"琪琪露·\"]) .custom-nvn-name-plate{border-left:3px solid #e0b12e !important;border-top:1px solid rgba(224, 177, 46,0.35) !important;border-bottom:1px solid rgba(224, 177, 46,0.35) !important;background:linear-gradient(90deg, rgba(224, 177, 46,0.22) 0%, rgba(224, 177, 46,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"米娜\"], [data-char^=\"米娜·\"]) .custom-nvn-name-initial{color:#266dd7 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"米娜\"], [data-char^=\"米娜·\"]) .custom-nvn-rose-crest{color:#266dd7 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"米娜\"], [data-char^=\"米娜·\"]) .custom-nvn-name-plate{border-left:3px solid #266dd7 !important;border-top:1px solid rgba(38, 109, 215,0.35) !important;border-bottom:1px solid rgba(38, 109, 215,0.35) !important;background:linear-gradient(90deg, rgba(38, 109, 215,0.22) 0%, rgba(38, 109, 215,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"莉莉\"], [data-char^=\"莉莉·\"]) .custom-nvn-name-initial{color:#dfa657 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"莉莉\"], [data-char^=\"莉莉·\"]) .custom-nvn-rose-crest{color:#dfa657 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"莉莉\"], [data-char^=\"莉莉·\"]) .custom-nvn-name-plate{border-left:3px solid #dfa657 !important;border-top:1px solid rgba(223, 166, 87,0.35) !important;border-bottom:1px solid rgba(223, 166, 87,0.35) !important;background:linear-gradient(90deg, rgba(223, 166, 87,0.22) 0%, rgba(223, 166, 87,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"菲玖\"], [data-char^=\"菲玖·\"]) .custom-nvn-name-initial{color:#9de064 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"菲玖\"], [data-char^=\"菲玖·\"]) .custom-nvn-rose-crest{color:#9de064 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"菲玖\"], [data-char^=\"菲玖·\"]) .custom-nvn-name-plate{border-left:3px solid #9de064 !important;border-top:1px solid rgba(157, 224, 100,0.35) !important;border-bottom:1px solid rgba(157, 224, 100,0.35) !important;background:linear-gradient(90deg, rgba(157, 224, 100,0.22) 0%, rgba(157, 224, 100,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"贞德\"], [data-char^=\"贞德·\"]) .custom-nvn-name-initial{color:#c38840 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"贞德\"], [data-char^=\"贞德·\"]) .custom-nvn-rose-crest{color:#c38840 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"贞德\"], [data-char^=\"贞德·\"]) .custom-nvn-name-plate{border-left:3px solid #c38840 !important;border-top:1px solid rgba(195, 136, 64,0.35) !important;border-bottom:1px solid rgba(195, 136, 64,0.35) !important;background:linear-gradient(90deg, rgba(195, 136, 64,0.22) 0%, rgba(195, 136, 64,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"雷格鲁斯\"], [data-char^=\"雷格鲁斯·\"]) .custom-nvn-name-initial{color:#b25b50 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"雷格鲁斯\"], [data-char^=\"雷格鲁斯·\"]) .custom-nvn-rose-crest{color:#b25b50 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"雷格鲁斯\"], [data-char^=\"雷格鲁斯·\"]) .custom-nvn-name-plate{border-left:3px solid #b25b50 !important;border-top:1px solid rgba(178, 91, 80,0.35) !important;border-bottom:1px solid rgba(178, 91, 80,0.35) !important;background:linear-gradient(90deg, rgba(178, 91, 80,0.22) 0%, rgba(178, 91, 80,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"卡朵莲\"], [data-char^=\"卡朵莲·\"]) .custom-nvn-name-initial{color:#d9d9e4 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"卡朵莲\"], [data-char^=\"卡朵莲·\"]) .custom-nvn-rose-crest{color:#d9d9e4 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"卡朵莲\"], [data-char^=\"卡朵莲·\"]) .custom-nvn-name-plate{border-left:3px solid #d9d9e4 !important;border-top:1px solid rgba(217, 217, 228,0.35) !important;border-bottom:1px solid rgba(217, 217, 228,0.35) !important;background:linear-gradient(90deg, rgba(217, 217, 228,0.22) 0%, rgba(217, 217, 228,0.04) 70%, transparent 100%) !important;}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"戴亚\"], [data-char^=\"戴亚·\"]) .custom-nvn-name-initial{color:#b73167 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"戴亚\"], [data-char^=\"戴亚·\"]) .custom-nvn-rose-crest{color:#b73167 !important}\n.mes_text div.custom-nvn-dialogue:is([data-char=\"戴亚\"], [data-char^=\"戴亚·\"]) .custom-nvn-name-plate{border-left:3px solid #b73167 !important;border-top:1px solid rgba(183, 49, 103,0.35) !important;border-bottom:1px solid rgba(183, 49, 103,0.35) !important;background:linear-gradient(90deg, rgba(183, 49, 103,0.22) 0%, rgba(183, 49, 103,0.04) 70%, transparent 100%) !important;}";
    head.appendChild(el);

    styleEl = el;
    current = theme;
  }

  function reconcile() {
    try {
      const t = themeFromDom() || current || themeFromConfig() || 'light';
      apply(t, false);
      if (!styleEl || !styleEl.isConnected) apply(t, true);
    } catch (_) {}
  }

  /* ---------------- 观察与事件 ---------------- */
  const disposers = [];
  let timer = null;
  let scheduled = false;
  let lastRun = 0;

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    const run = function () {
      scheduled = false;
      try {
        if (Date.now() - lastRun < 250) { setTimeout(run, 250); return; }
        lastRun = Date.now();
        reconcile();
      } catch (_) {}
    };
    try { (HW.requestAnimationFrame || setTimeout)(run, 0); } catch (_) { setTimeout(run, 0); }
  }

  function wireObserver() {
    const MO = HW.MutationObserver || window.MutationObserver;
    if (!MO || !HD.body) return;
    try {
      const mo = new MO(function () { schedule(); });
      mo.observe(HD.body, { childList: true, subtree: true });
      disposers.push(function () { try { mo.disconnect(); } catch (_) {} });
    } catch (_) {}
  }

  function wireEvents() {
    const on = fn('eventOn');
    if (typeof on !== 'function') return;
    let ET = null;
    try { if (typeof event_types !== 'undefined' && event_types) ET = event_types; } catch (_) {}
    const pairs = [
      ['MESSAGE_RENDERED',   'message_rendered'],
      ['MESSAGE_UPDATED',    'message_updated'],
      ['MESSAGE_EDITED',     'message_edited'],
      ['MESSAGE_SWIPED',     'message_swiped'],
      ['GENERATION_ENDED',   'generation_ended'],
      ['CHAT_CHANGED',       'chat_changed'],
      ['CHARACTER_SELECTED', 'character_selected'],
      ['GROUP_UPDATED',      'group_updated'],
    ];
    for (const p of pairs) {
      const name = (ET && ET[p[0]]) || p[1];
      try { on(name, function () { schedule(); }); } catch (_) {}
    }
  }

  /* ---------------- 启动 ---------------- */
  function destroy() {
    try { if (timer) clearInterval(timer); } catch (_) {}
    timer = null;
    for (const d of disposers.splice(0)) { try { d(); } catch (_) {} }
    try { if (styleEl && styleEl.isConnected) styleEl.remove(); } catch (_) {}
    styleEl = null;
    current = null;
  }

  function boot() {
    try { if (HW[SLOT] && typeof HW[SLOT].destroy === 'function') HW[SLOT].destroy(); } catch (_) {}

    apply(themeFromDom() || themeFromConfig() || 'light', true);
    wireObserver();
    wireEvents();
    try { timer = setInterval(reconcile, 2000); } catch (_) {}

    HW[SLOT] = {
      version: VERSION,
      destroy: destroy,
      reconcile: reconcile,
      newCharacters: NEW_CHARACTERS,
    };
  }

  boot();

  try { setTimeout(function () { reconcile(); wireObserver(); }, 1200); } catch (_) {}
})();
