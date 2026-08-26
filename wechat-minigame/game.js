try {
  require('./src/main-3d.js');
} catch (error) {
  const detail = String(error?.stack || error?.message || error);
  try {
    wx.setStorageSync('happy-jump-startup-error', detail);
    wx.getFileSystemManager().writeFileSync(`${wx.env.USER_DATA_PATH}/happy-jump-startup-error.txt`, detail, 'utf8');
  } catch { /* The original startup error is more useful than a logging error. */ }
  console.error('Happy Jump startup failed', error);
  wx.showModal?.({
    title: '游戏启动失败',
    content: '3D 画面未能启动，请更新微信后重新打开。',
    showCancel: false
  });
  throw error;
}
