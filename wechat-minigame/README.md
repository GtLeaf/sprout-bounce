# Happy Jump 微信小游戏

这是网页版 Happy Jump 的微信小游戏发布包。游戏保留 Three.js 3D 棋盘、角色和完整玩法，界面、触控、存储与账号服务改用微信小游戏原生 API，不依赖 DOM、CSS、Supabase 或邮箱账号。

## 已实现

- 微信启动登录：客户端调用 `wx.login` 刷新登录态，云函数通过 `cloud.getWXContext().OPENID` 识别当前玩家。
- 回访恢复：同一个微信玩家再次进入时，自动读取历史最佳分数、最高关卡、游戏局数和全球排名。
- 真实排行榜：结算成绩写入云数据库，公开榜单只返回昵称、头像和成绩，不返回 OpenID。
- 授权头像昵称：只有玩家主动点击微信原生“使用微信头像昵称”按钮后才保存；云函数同时通过 `cloudID` 开放数据标记和 AppID 水印校验数据。
- 离线补传：网络异常时保留本机最高待传成绩，下次登录自动补传。
- 完整 3D 玩法：7×7 立体棋盘、低多边形角色、四向滑动、同色四格预警爆破、补格、奖励、3 条生命、8 层计时挑战与逐层结算。
- 微信生命周期：切到后台自动暂停，返回后继续；触控滑动与网页节奏保持一致。
- 真机兼容：3D 引擎使用仍支持 WebGL 1 回退的 Three.js r162，兼容未开放 WebGL 2 的微信设备。

## 在微信开发者工具中运行

1. 在微信公众平台注册“小游戏”并取得小游戏 AppID。不要使用普通小程序 AppID。
2. 用微信开发者工具导入本目录 `wechat-minigame`，项目类型选择“小游戏”。
3. 确认 `project.config.json` 中的 `appid` 是正式小游戏 AppID。测试号可以预览和上传开发版本，但微信不允许测试号使用云服务或提交正式审核。
4. 在开发者工具中开通云开发并创建一个环境，把环境 ID 填入 `src/config.js` 的 `cloudEnvId`。
5. 在云数据库创建集合 `happy_jump_players`。集合权限设为“所有用户不可读写”；小游戏客户端只通过云函数访问，云函数仍可正常读写。
6. 右键 `cloudfunctions/leaderboard`，选择“上传并部署：云端安装依赖”。
7. 在云数据库索引管理中确认 `bestScore` 有降序索引；首次运行查询提示缺少索引时，按控制台提示创建即可。
8. 在小游戏后台的隐私保护指引中声明使用“昵称、头像”，用途填写为展示玩家资料与排行榜。
9. 点击“预览”，分别用两个微信账号完成一局，确认榜单能看到两条不同记录；同一账号再次打开后应恢复原成绩。

## 构建 3D 入口

仓库已提交可直接运行的 `src/main-3d.js`。修改网页版 3D 逻辑或 `src/*.mjs` 后，用 esbuild 重新生成：

```powershell
pnpm dlx esbuild@0.25.9 src/main-3d.mjs --bundle --platform=neutral --format=cjs --target=es2018 --outfile=src/main-3d.js --legal-comments=inline
```

## 配置文件

`src/config.js`：

```js
module.exports = Object.freeze({
  cloudEnvId: '你的云环境ID',
  cloudFunctionName: 'leaderboard',
  leaderboardLimit: 20
});
```

不要在客户端或 Git 仓库中保存微信 AppSecret、`session_key`、云函数密钥或原始 OpenID。当前实现不会把这些信息返回给客户端。

## 排行榜数据

集合 `happy_jump_players` 每个 OpenID 只对应一条记录。云函数忽略客户端传来的 `openid`、`playerId` 和 `_id`，因此玩家不能指定或修改其他玩家的记录。最佳分数只会上升，重复上传较低成绩不会覆盖历史最高分。

排行榜身份隔离不等于强反作弊。小游戏逻辑仍在客户端运行，修改版客户端可能伪造自己的分数。正式竞技活动应增加服务端对局校验、操作日志验签或微信游戏服务的权威对局能力。
