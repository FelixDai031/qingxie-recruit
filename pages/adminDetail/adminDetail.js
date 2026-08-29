// pages/adminDetail/adminDetail.js —— 报名详情页（管理员）
Page({
  data: {
    loading: true,
    item: null
  },

  async onLoad(options) {
    const id = options.id || '';
    if (!id) {
      wx.showToast({ title: '缺少参数', icon: 'none' });
      this.setData({ loading: false });
      return;
    }
    await this.loadDetail(id);
  },

  async loadDetail(id) {
    this.setData({ loading: true });
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'adminCheck',
        data: { action: 'detail', id }
      });
      if (result && result.ok && result.data) {
        const item = result.data;
        this.setData({
          item: {
            ...item,
            timeText: this.formatDate(item.createTime)
          },
          loading: false
        });
      } else {
        this.setData({ loading: false });
        wx.showToast({ title: (result && result.msg) || '记录不存在或无权限', icon: 'none' });
      }
    } catch (err) {
      this.setData({ loading: false });
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  formatDate(d) {
    const date = new Date(d);
    const pad = n => (n < 10 ? '0' + n : n);
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  },

  async review(e) {
    const { id, status, dept, openid } = e.currentTarget.dataset;
    const statusMap = { pass: '通过', wait: '待定' };
    const { confirm } = await wx.showModal({
      title: '确认操作',
      content: `确定将该报名设为「${statusMap[status]}」吗？`
    });
    if (!confirm) return;

    wx.showLoading({ title: '处理中' });
    try {
      await wx.cloud.callFunction({
        name: 'adminCheck',
        data: { action: 'update', id, status, statusText: statusMap[status], dept, openid }
      });
      wx.showToast({ title: '操作成功', icon: 'success' });
      this.setData({ 'item.status': status, 'item.statusText': statusMap[status] });
    } catch (err) {
      wx.showToast({ title: '操作失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  }
});
