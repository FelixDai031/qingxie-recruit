// pages/admin/admin.js —— 管理员审核页

Page({
  data: {
    loading: true,
    isAdmin: false,
    filter: 'pending',
    list: [],
    allList: [],
    exporting: false,
    selectedIds: [],
    allSelected: false,
    selectMode: false,
    // 统计与招新设置
    stats: { total: 0, pending: 0, pass: 0, wait: 0, reject: 0 },
    byDept: [],
    maxDeptCount: 1,
    recruitOpen: true,
    toggling: false,
    // 顶部标签页：review=报名审核（默认），manage=管理设置
    adminTab: 'review',
    // 部门级权限
    myDeptNames: '',
    isAllDept: true
  },

  // 切换顶部标签页
  switchAdminTab(e) {
    const tab = e.currentTarget.dataset.tab;
    if (tab === this.data.adminTab) return;
    this.setData({ adminTab: tab });
    // 进入管理设置时刷新统计与开关状态
    if (tab === 'manage') {
      this.loadStats();
      this.loadConfig();
    }
  },

  async onLoad() {
    await this.checkAuth();
  },

  async onShow() {
    if (this.data.isAdmin) {
      await this.loadList();
      this.loadStats();
      this.loadConfig();
    }
  },

  async checkAuth() {
    try {
      const { result } = await wx.cloud.callFunction({ name: 'adminCheck', data: { action: 'check' } });
      if (result && result.ok) {
        this.setData({
          isAdmin: true,
          myDeptNames: Array.isArray(result.deptNames) ? result.deptNames.join('、') : '',
          isAllDept: !!result.isAllDept
        });
        await this.loadList();
        this.loadStats();
        this.loadConfig();
      } else {
        this.setData({ isAdmin: false, loading: false });
      }
    } catch (err) {
      console.error('权限校验失败', err);
      this.setData({ isAdmin: false, loading: false });
    }
  },

  // 报名统计（全局，不随筛选变化）
  async loadStats() {
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'adminCheck',
        data: { action: 'stats' }
      });
      if (result && result.ok) {
        const byDept = result.byDept || [];
        const maxDeptCount = byDept.length ? byDept[0].count : 1;
        this.setData({
          stats: {
            total: result.total || 0,
            pending: (result.byStatus && result.byStatus.pending) || 0,
            pass: (result.byStatus && result.byStatus.pass) || 0,
            wait: (result.byStatus && result.byStatus.wait) || 0,
            reject: (result.byStatus && result.byStatus.reject) || 0
          },
          byDept,
          maxDeptCount
        });
      }
    } catch (err) {
      console.error('统计加载失败', err);
    }
  },

  // 读取报名开关状态
  async loadConfig() {
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'adminCheck',
        data: { action: 'getConfig' }
      });
      if (result && result.ok) {
        this.setData({ recruitOpen: result.recruitOpen !== false });
      }
    } catch (err) {
      console.error('配置读取失败', err);
    }
  },

  // 切换报名开关
  async toggleRecruitOpen(e) {
    const open = e.detail.value;
    if (this.data.toggling) {
      this.setData({ recruitOpen: !open });
      return;
    }
    const { confirm } = await wx.showModal({
      title: '确认操作',
      content: open
        ? '确定重新开放报名吗？开放后学生可以提交报名表。'
        : '关闭后学生将无法提交报名，确定关闭吗？'
    });
    if (!confirm) {
      this.setData({ recruitOpen: !open });
      return;
    }
    this.setData({ toggling: true });
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'adminCheck',
        data: { action: 'setRecruitOpen', recruitOpen: open }
      });
      if (result && result.ok) {
        this.setData({ recruitOpen: open });
        wx.showToast({ title: open ? '已开放报名' : '已关闭报名', icon: 'success' });
      } else {
        throw new Error((result && result.msg) || '保存失败');
      }
    } catch (err) {
      this.setData({ recruitOpen: !open });
      wx.showModal({
        title: '操作失败',
        content: String(err.message || '请确认已部署新版 adminCheck 云函数'),
        showCancel: false
      });
    } finally {
      this.setData({ toggling: false });
    }
  },

  async loadList() {
    this.setData({ loading: true });
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'adminCheck',
        data: { action: 'list', filter: this.data.filter }
      });
      const list = (result.data || []).map(item => ({
        ...item,
        timeText: this.formatDate(item.createTime),
        expanded: false,
        longIntro: (item.intro || '').length > 40,
        selected: false
      }));
      this.setData({ list, loading: false, selectedIds: [], allSelected: false });
    } catch (err) {
      wx.showToast({ title: '加载失败', icon: 'none' });
      this.setData({ loading: false });
    }
  },

  setFilter(e) {
    this.setData({ filter: e.currentTarget.dataset.type }, () => {
      this.loadList();
    });
  },

  formatDate(d) {
    const date = new Date(d);
    const pad = n => (n < 10 ? '0' + n : n);
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  },

  async review(e) {
    const { id, status, dept, openid } = e.currentTarget.dataset;
    const statusMap = { pass: '通过', wait: '待定', reject: '不通过', pending: '待审核' };
    const tips = {
      pass: '确定通过该报名吗？',
      wait: '确定将该报名设为「待定」吗？',
      reject: '确定驳回该报名吗？驳回后学生可重新提交报名。',
      pending: '确定撤销审核、重置为待审核吗？'
    };

    const { confirm } = await wx.showModal({
      title: '确认操作',
      content: tips[status] || `确定将该报名设为「${statusMap[status]}」吗？`
    });
    if (!confirm) return;

    wx.showLoading({ title: '处理中' });
    try {
      await wx.cloud.callFunction({
        name: 'adminCheck',
        data: {
          action: 'update',
          id,
          status,
          statusText: statusMap[status],
          dept,
          openid
        }
      });
      wx.showToast({ title: '操作成功', icon: 'success' });
      await this.loadList();
      this.loadStats();
    } catch (err) {
      wx.showToast({ title: '操作失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  toggleExpand(e) {
    const id = e.currentTarget.dataset.id;
    const list = this.data.list.map(it =>
      it._id === id ? { ...it, expanded: !it.expanded } : it
    );
    this.setData({ list });
  },

  goDetail(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({ url: `/pages/adminDetail/adminDetail?id=${id}` });
  },

  toggleSelect(e) {
    const id = e.currentTarget.dataset.id;
    const list = this.data.list.map(it =>
      it._id === id ? { ...it, selected: !it.selected } : it
    );
    const selectedIds = list.filter(it => it.selected).map(it => it._id);
    this.setData({
      list,
      selectedIds,
      allSelected: list.length > 0 && selectedIds.length === list.length
    });
  },

  toggleSelectAll() {
    const all = !this.data.allSelected;
    const list = this.data.list.map(it => ({ ...it, selected: all }));
    const selectedIds = all ? list.map(it => it._id) : [];
    this.setData({ list, selectedIds, allSelected: all });
  },

  enterSelect() {
    this.setData({ selectMode: true });
  },

  exitSelect() {
    const list = this.data.list.map(it => ({ ...it, selected: false }));
    this.setData({ selectMode: false, list, selectedIds: [], allSelected: false });
  },

  goEditDept() {
    wx.navigateTo({
      url: '/pages/deptEdit/deptEdit',
      fail: (err) => {
        console.error('跳转编辑页失败', err);
        wx.showModal({
          title: '打不开编辑页',
          content: '请确认已重新上传小程序代码（含 deptEdit 页面）并重新编译。',
          showCancel: false
        });
      }
    });
  },

  async exportTable() {
    if (this.data.exporting) return;

    // 选择模式下必须勾选；浏览模式下导出当前筛选全部
    let data;
    if (this.data.selectMode) {
      const ids = this.data.selectedIds;
      if (!ids || ids.length === 0) {
        wx.showToast({ title: '请先勾选要导出的报名', icon: 'none' });
        return;
      }
      data = { ids };
    } else {
      data = { filter: this.data.filter };
    }

    this.setData({ exporting: true });
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'exportExcel',
        data
      });
      if (!result || !result.ok) {
        this.showExportError((result && result.msg) || '导出失败');
        return;
      }

      const fileID = result.fileID;
      const fileURL = result.fileURL;
      if (!fileID && !fileURL) {
        throw new Error('云端未返回文件信息');
      }

      // 优先使用 fileID 直接下载，真机更稳定
      let tempFilePath = '';
      try {
        const dl = await wx.cloud.downloadFile({ fileID });
        tempFilePath = dl.tempFilePath;
      } catch (fileErr) {
        console.error('fileID 下载失败，尝试 URL 兜底', fileErr);
        // 兜底：用临时链接下载
        if (!fileURL) throw new Error('文件下载失败，且无临时链接');
        const dl2 = await wx.downloadFile({ url: fileURL });
        if (dl2.statusCode !== 200) throw new Error('临时链接下载失败，状态码 ' + dl2.statusCode);
        tempFilePath = dl2.tempFilePath;
      }

      wx.openDocument({
        filePath: tempFilePath,
        fileType: 'xlsx',
        showMenu: true,
        success: () => wx.showToast({ title: '已用 WPS 打开，可转发/保存', icon: 'none' }),
        fail: (openErr) => {
          console.error('openDocument fail', openErr);
          // 打开失败兜底：复制链接，可在 WPS / 电脑打开
          wx.setClipboardData({
            data: fileURL || fileID,
            success: () => wx.showToast({ title: '已复制链接，可在 WPS 中打开', icon: 'none' })
          });
        }
      });
    } catch (err) {
      console.error('导出失败', err);
      const msg = (err && (err.errMsg || err.message)) ? String(err.errMsg || err.message) : '导出失败，请重试';
      this.showExportError(msg);
    } finally {
      this.setData({ exporting: false });
    }
  },

  showExportError(msg) {
    wx.showModal({
      title: '导出失败',
      content: String(msg || '未知错误'),
      showCancel: false,
      confirmText: '知道了'
    });
  },

  // 跳转管理员管理专页
  goAdminManage() {
    wx.navigateTo({
      url: '/pages/adminManage/adminManage',
      fail: (err) => {
        console.error('跳转管理员管理页失败', err);
        wx.showModal({
          title: '跳转失败',
          content: '请确认已重新上传小程序代码（含 adminManage 页面）并重新编译。',
          showCancel: false
        });
      }
    });
  },

  formatDate(d) {
    const date = new Date(d);
    const pad = n => (n < 10 ? '0' + n : n);
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }
});
