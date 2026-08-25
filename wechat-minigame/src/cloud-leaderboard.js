const PENDING_SCORE_KEY = 'happy-jump-wechat-pending-score-v1';

function callWx(method, options = {}) {
  return new Promise((resolve, reject) => {
    method({
      ...options,
      success: resolve,
      fail: reject
    });
  });
}

class WechatLeaderboard {
  constructor(wxApi, config) {
    this.wx = wxApi;
    this.config = config;
    this.player = null;
    this.entries = [];
    this.rank = null;
    this.ready = false;
  }

  async initialize() {
    if (!this.wx.cloud) throw new Error('当前微信基础库不支持云开发');
    const initOptions = { traceUser: true };
    if (this.config.cloudEnvId) initOptions.env = this.config.cloudEnvId;
    this.wx.cloud.init(initOptions);

    // Refresh the WeChat session once per launch. The temporary code never
    // leaves WeChat APIs; player identity is resolved inside the cloud function.
    const loginResult = await callWx(this.wx.login.bind(this.wx), { timeout: 8000 });
    if (!loginResult?.code) throw new Error('微信登录失败，请重新进入游戏');
    const result = await this.call('login');
    this.applyResult(result);
    this.ready = true;
    await this.flushPendingScore().catch(() => null);
    return result;
  }

  async call(action, data = {}) {
    const response = await callWx(this.wx.cloud.callFunction.bind(this.wx.cloud), {
      name: this.config.cloudFunctionName,
      data: { action, ...data }
    });
    const result = response && response.result;
    if (!result || result.ok !== true) {
      throw new Error(result?.message || '微信云服务暂时不可用');
    }
    return result;
  }

  applyResult(result) {
    if (result.player) this.player = result.player;
    if (Array.isArray(result.entries)) this.entries = result.entries;
    if (Number.isInteger(result.myRank)) this.rank = result.myRank;
  }

  async refresh() {
    const result = await this.call('list', { limit: this.config.leaderboardLimit });
    this.applyResult(result);
    return result;
  }

  async submitScore(score) {
    const cleanScore = {
      score: Math.max(0, Math.floor(Number(score.score) || 0)),
      level: Math.max(1, Math.floor(Number(score.level) || 1)),
      won: Boolean(score.won)
    };
    try {
      const result = await this.call('submitScore', cleanScore);
      this.applyResult(result);
      this.wx.removeStorageSync(PENDING_SCORE_KEY);
      return result;
    } catch (error) {
      const existing = this.wx.getStorageSync(PENDING_SCORE_KEY);
      if (!existing || cleanScore.score > existing.score
        || (cleanScore.score === existing.score && cleanScore.level > existing.level)) {
        this.wx.setStorageSync(PENDING_SCORE_KEY, cleanScore);
      }
      throw error;
    }
  }

  async flushPendingScore() {
    const pending = this.wx.getStorageSync(PENDING_SCORE_KEY);
    if (!pending) return null;
    return this.submitScore(pending);
  }

  async updateAuthorizedProfile(cloudId) {
    if (!cloudId) throw new Error('没有收到有效的微信授权信息');
    const result = await this.call('updateProfile', {
      authorizedProfile: this.wx.cloud.CloudID(cloudId)
    });
    this.applyResult(result);
    return result;
  }
}

module.exports = { PENDING_SCORE_KEY, WechatLeaderboard };
