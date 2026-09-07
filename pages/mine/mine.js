// pages/mine/mine.js —— 我的报名 + 用户登录
const { db, getOpenid } = require('../../utils/cloud.js');

Page({
  data: {
    loading: true,
    openid: '',
    logged: false,
    userInfo: null,
    showLogin: false,
    tempAvatar: '',
    tempNick: '',
    logging: false,
    applications: [],
    isAdmin: false,
    initing: false,
    // 申请管理员弹层
    applySheetVisible: false,
    applyName: '',
    applyRemark: '',
    applySubmitting: false
  },

  async onShow() {
    // 先读本地缓存快速渲染
    const cached = wx.getStorageSync('userInfo');
    if (cached) {
      this.setData({ logged: true, userInfo: cached });
    }
    await this.loadMine();
    await this.syncProfile();
  },

  // 从云端同步用户资料（跨设备 / 换手机也能恢复登录态）
  async syncProfile() {
    try {
      const { result } = await wx.cloud.callFunction({ name: 'login', data: { action: 'get' } });
      if (result && result.ok && result.user) {
        this.setData({ logged: true, userInfo: result.user });
        if (result.user.openid) this.setData({ openid: result.user.openid });
        wx.setStorageSync('userInfo', result.user);
      }
    } catch (e) {
      // login 云函数未部署时静默，不影响报名功能
    }
  },

  async loadMine() {
    this.setData({ loading: true });
    try {
      // openid 优先取登录用户资料（来自 login 云函数，最可靠），失败再退回 adminCheck
      const openid = (this.data.userInfo && this.data.userInfo.openid) || (await getOpenid()) || '';
      const { data } = await db().collection('applications')
        .orderBy('createTime', 'desc')
        .get();

      const applications = data.map(item => ({
        ...item,
        maskPhone: this.maskPhone(item.phone),
        timeText: item.createTime ? this.formatDate(item.createTime) : '-'
      }));

      this.setData({ openid, applications });
      this.checkAdmin();
    } catch (err) {
      console.error('加载失败', err);
      wx.showToast({ title: '加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  async checkAdmin() {
    try {
      const { result } = await wx.cloud.callFunction({ name: 'adminCheck', data: { action: 'check' } });
      this.setData({ isAdmin: result && result.ok });
    } catch (e) {
      this.setData({ isAdmin: false });
    }
  },

  // ===== 登录相关 =====
  // 阻止弹窗内部点击冒泡到遮罩层（遮罩层绑定了 hideLogin）
  stopPropagation() {},

  showLogin() {
    this.setData({ showLogin: true, tempAvatar: '', tempNick: '' });
  },

  hideLogin() {
    this.setData({ showLogin: false });
  },

  onChooseAvatar(e) {
    // 微信官方头像选择器回调，e.detail.avatarUrl 为临时头像路径
    if (e.detail.avatarUrl) {
      this.setData({ tempAvatar: e.detail.avatarUrl });
    }
  },

  onNickInput(e) {
    this.setData({ tempNick: e.detail.value });
  },

  async doLogin(e) {
    if (this.data.logging) return;
    // 从 form submit 事件取昵称（比 bindinput 更可靠，能正确捕获 type=nickname 的"使用微信昵称"值）
    const formNick = e && e.detail && e.detail.value ? e.detail.value.nickName : '';
    const nickName = formNick || this.data.tempNick || '';
    const { tempAvatar } = this.data;
    if (!nickName && !tempAvatar) {
      wx.showToast({ title: '请选择头像或填写昵称', icon: 'none' });
      return;
    }

    this.setData({ logging: true });
    wx.showLoading({ title: '登录中…', mask: true });

    try {
      // 头像上传到云存储，拿到永久 fileID
      let avatarUrl = '';
      if (tempAvatar) {
        const ext = (tempAvatar.match(/\.(\w+)$/) || [null, 'png'])[1];
        const cloudPath = 'avatars/' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.' + ext;
        const uploadRes = await wx.cloud.uploadFile({ cloudPath, filePath: tempAvatar });
        avatarUrl = uploadRes.fileID;
      }

      // 调云函数保存用户资料
      const { result } = await wx.cloud.callFunction({
        name: 'login',
        data: { action: 'login', nickName: nickName, avatarUrl }
      });

      wx.hideLoading();

      if (result && result.ok) {
        this.setData({
          logged: true,
          userInfo: result.user,
          showLogin: false,
          logging: false
        });
        wx.setStorageSync('userInfo', result.user);
        wx.showToast({ title: '登录成功', icon: 'success' });
      } else {
        wx.showToast({ title: (result && result.msg) || '登录失败', icon: 'none' });
        this.setData({ logging: false });
      }
    } catch (err) {
      wx.hideLoading();
      console.error('登录失败', err);
      const detail = (err && err.errMsg) || '登录失败';
      wx.showModal({
        title: '登录失败',
        content: detail.indexOf('FunctionName') > -1
          ? '未找到 login 云函数，请先在开发者工具里部署它'
          : detail,
        showCancel: false
      });
      this.setData({ logging: false });
    }
  },

  doLogout() {
    wx.showModal({
      title: '提示',
      content: '确定退出登录吗？',
      success: (res) => {
        if (res.confirm) {
          wx.removeStorageSync('userInfo');
          this.setData({ logged: false, userInfo: null });
          wx.showToast({ title: '已退出', icon: 'none' });
        }
      }
    });
  },

  // 复制自己的专属 ID（供面试官发给管理员授权）
  copyOpenid() {
    if (!this.data.openid) {
      wx.showToast({ title: '请稍候', icon: 'none' });
      return;
    }
    wx.setClipboardData({
      data: this.data.openid,
      success: () => wx.showToast({ title: '已复制你的专属ID', icon: 'none' })
    });
  },

  // 非管理员：点击卡片 → 打开申请弹层（先填姓名/备注才能提交）
  openApplySheet() {
    if (!this.data.openid) {
      wx.showToast({ title: '请稍候，身份获取中', icon: 'none' });
      return;
    }
    this.setData({
      applySheetVisible: true,
      applyName: '',
      applyRemark: '',
      applySubmitting: false
    });
  },

  closeApplySheet() {
    if (this.data.applySubmitting) return;
    this.setData({ applySheetVisible: false });
  },

  stopPropagation() {},

  onApplyNameInput(e) {
    this.setData({ applyName: (e.detail.value || '').trim() });
  },

  onApplyRemarkInput(e) {
    this.setData({ applyRemark: e.detail.value || '' });
  },

  // 提交申请：姓名必填，备注可选
  async submitApplyAdmin() {
    const name = this.data.applyName;
    if (!name) {
      wx.showToast({ title: '请先填写姓名/备注', icon: 'none' });
      return;
    }
    if (name.length > 30) {
      wx.showToast({ title: '姓名/备注不超过 30 字', icon: 'none' });
      return;
    }
    const remark = (this.data.applyRemark || '').trim();
    if (remark.length > 200) {
      wx.showToast({ title: '补充说明不超过 200 字', icon: 'none' });
      return;
    }
    this.setData({ applySubmitting: true });
    wx.showLoading({ title: '提交中' });
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'adminCheck',
        data: { action: 'requestAdmin', name, remark }
      });
      wx.hideLoading();
      this.setData({ applySubmitting: false });
      if (result && result.ok) {
        this.setData({ applySheetVisible: false });
        wx.showModal({
          title: '申请已提交',
          content: '请等待负责人在小程序管理页审核，通过后你将自动获得审核权限。',
          showCancel: false
        });
      } else {
        wx.showModal({
          title: '无法提交',
          content: (result && result.msg) || '请稍后重试',
          showCancel: false
        });
      }
    } catch (err) {
      wx.hideLoading();
      this.setData({ applySubmitting: false });
      console.error('申请管理员失败', err);
      wx.showModal({
        title: '提交失败',
        content: '网络异常或云函数未部署，请稍后重试',
        showCancel: false
      });
    }
  },

  // ===== 工具方法 =====
  maskPhone(phone) {
    if (!phone || phone.length !== 11) return phone;
    return phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2');
  },

  formatDate(d) {
    const date = new Date(d);
    const pad = n => (n < 10 ? '0' + n : n);
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) +
      ' ' + pad(date.getHours()) + ':' + pad(date.getMinutes());
  },

  goApply() {
    wx.switchTab({ url: '/pages/apply/apply' });
  },

  goAdmin() {
    wx.navigateTo({ url: '/pages/admin/admin' });
  },

  // 一键初始化：写入部门数据 + 把自己设为管理员（仅首次使用）
  async initData() {
    if (this.data.initing) return;
    this.setData({ initing: true });
    wx.showLoading({ title: '初始化中…', mask: true });
    try {
      const { result } = await wx.cloud.callFunction({ name: 'initData' });
      wx.hideLoading();
      if (result && result.ok) {
        wx.showModal({
          title: '初始化完成',
          content: '已写入 ' + result.departments + ' 个部门，并将当前账号设为管理员。',
          showCancel: false,
          success: () => this.loadMine()
        });
      } else {
        wx.showToast({ title: (result && result.msg) || '初始化失败', icon: 'none' });
        this.setData({ initing: false });
      }
    } catch (err) {
      wx.hideLoading();
      console.error('初始化失败', err);
      const detail = (err && err.errMsg) || JSON.stringify(err) || '未知错误';
      wx.showModal({
        title: '初始化失败',
        content: detail.indexOf('FunctionName') > -1
          ? '未找到 initData 云函数，请先在开发者工具里部署它'
          : detail.length > 120 ? detail.slice(0, 120) + '…' : detail,
        showCancel: false
      });
      this.setData({ initing: false });
    }
  }
});
