// pages/department/department.js —— 部门详情
const { getDepartments, getCloudFileUrls } = require('../../utils/cloud.js');

Page({
  data: {
    deptId: '',
    dept: { icon: '', name: '', slogan: '', intro: '', duties: [], requirements: [] },
    photoUrls: []
  },

  async onLoad(options) {
    const id = options.id || '';
    this.setData({ deptId: id });
    await this.loadDept(id);
  },

  async loadDept(id) {
    const list = await getDepartments();
    const dept = list.find(d => d._id === id) || list[0] || {};
    const photoUrls = Array.isArray(dept.photos) ? await getCloudFileUrls(dept.photos) : [];
    this.setData({ dept, photoUrls });
    // 动态设置导航栏标题
    if (dept.name) {
      wx.setNavigationBarTitle({ title: dept.name });
    }
  },

  goApply() {
    const { deptId, dept } = this.data;
    const id = deptId || (dept && dept._id) || '';
    // 报名页是 tabBar 页面，navigateTo 无法携带参数跳转；
    // 先把部门 ID 存入缓存，再 switchTab 跳转，由报名页读取缓存自动选中
    wx.setStorageSync('pendingDeptId', id);
    wx.switchTab({ url: '/pages/apply/apply' });
  },

  // 相册照片全屏预览（必须用 https 临时链接）
  previewPhoto(e) {
    const index = Number(e.currentTarget.dataset.index);
    const urls = this.data.photoUrls || [];
    if (!urls.length) return;
    wx.previewImage({
      current: urls[index],
      urls
    });
  },

  onShareAppMessage() {
    const { dept } = this.data;
    return {
      title: `${dept.name}招新｜校青年志愿者协会`,
      path: `/pages/department/department?id=${dept._id}`
    };
  }
});
