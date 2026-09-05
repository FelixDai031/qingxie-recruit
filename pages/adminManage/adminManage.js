// pages/adminManage/adminManage.js —— 管理员管理专页

const ADMIN_REQ_TMPL_ID = 'StX_veM_rCFpbFDjtsJkAp8_RLi2iUCmE71SafTiFLU';

Page({
  data: {
    loading: true,
    isAdmin: false,
    // 当前视图：list=管理员列表, add=添加管理员, requests=审批申请
    view: 'list',
    // 管理员名单
    adminList: [],
    // 待审批申请
    adminRequests: [],
    // 部门选项（添加/编辑用）
    deptOptions: [],
    // 添加管理员
    newAdminId: '',
    newAdminName: '',
    adding: false,
    addMsg: '',
    // 编辑中管理员 _id
    editingId: '',
    // 顶部统计
    stats: { total: 0, boss: 0, requestCount: 0 },
    // 审批处理中
    handlingReq: false
  },

  async onLoad() {
    await this.checkAuth();
  },

  async onShow() {
    if (!this.data.isAdmin) return;
    this.refreshAll();
  },

  async checkAuth() {
    try {
      const { result } = await wx.cloud.callFunction({ name: 'adminCheck', data: { action: 'check' } });
      if (result && result.ok) {
        this.setData({ isAdmin: true });
        await this.refreshAll();
      } else {
        this.setData({ isAdmin: false, loading: false });
      }
    } catch (err) {
      console.error('权限校验失败', err);
      this.setData({ isAdmin: false, loading: false });
    }
  },

  async refreshAll() {
    this.setData({ loading: true });
    await this.loadDeptOptions();
    await Promise.all([
      this.loadAdminList(),
      this.loadAdminRequests()
    ]);
    this.setData({ loading: false });
  },

  // 切换视图
  switchView(e) {
    const view = e.currentTarget.dataset.view;
    this.setData({ view, addMsg: '' });
  },

  backToList() {
    this.setData({ view: 'list', addMsg: '', editingId: '' });
  },

  // 加载部门选项
  async loadDeptOptions() {
    if (this.data.deptOptions.length) return;
    try {
      const { result } = await wx.cloud.callFunction({ name: 'adminCheck', data: { action: 'listDepts' } });
      if (result && result.ok) {
        const deptOptions = (result.data || []).map(d => ({ _id: d._id, name: d.name, checked: false }));
        this.setData({ deptOptions });
      }
    } catch (err) {
      console.error('部门选项加载失败', err);
    }
  },

  // 加载管理员名单
  async loadAdminList() {
    try {
      const { result } = await wx.cloud.callFunction({ name: 'adminCheck', data: { action: 'listAdmins' } });
      if (!result || !result.ok) return;
      const deptOptions = this.data.deptOptions;
      const colors = ['#FF7A59', '#4C6FFF', '#00C9A7', '#9B59B6', '#F59E0B', '#EC4899', '#10B981'];
      const adminList = (result.data || []).map((a, idx) => {
        const deptNames = (a.deptNames && a.deptNames.length) ? a.deptNames : [];
        const isBoss = a.isBoss;
        const displayName = a.name || (a.isSelf ? '我' : '未命名');
        let scopeSummary;
        if (isBoss) {
          scopeSummary = '管理全部部门';
        } else if (deptNames.length === 0) {
          scopeSummary = '未分配部门';
        } else if (deptNames.length <= 3) {
          scopeSummary = deptNames.join('、');
        } else {
          scopeSummary = deptNames.slice(0, 2).join('、') + ' 等' + deptNames.length + '个部门';
        }
        return {
          ...a,
          idShort: (a.openid || '').slice(-8),
          displayName,
          firstChar: displayName.charAt(0).toUpperCase() || 'A',
          avatarColor: colors[idx % colors.length],
          scopeSummary,
          editName: a.name || '',
          editDeptOptions: deptOptions.map(d => ({
            _id: d._id,
            name: d.name,
            checked: (a.deptIds || []).indexOf(d._id) !== -1
          }))
        };
      });
      const boss = adminList.filter(a => a.isBoss).length;
      this.setData({
        adminList,
        stats: { ...this.data.stats, total: adminList.length, boss }
      });
    } catch (err) {
      console.error('管理员名单加载失败', err);
    }
  },

  // 加载管理员申请
  async loadAdminRequests() {
    try {
      const { result } = await wx.cloud.callFunction({ name: 'adminCheck', data: { action: 'listAdminRequests' } });
      if (result && result.ok) {
        const list = (result.data || []).map(it => ({
          ...it,
          idShort: (it.openid || '').slice(0, 12) + '…',
          timeText: this.formatDate(it.createTime)
        }));
        this.setData({
          adminRequests: list,
          stats: { ...this.data.stats, requestCount: list.length }
        });
      }
    } catch (err) {
      console.error('管理员申请加载失败', err);
    }
  },

  // 展开/收起编辑
  toggleEditAdmin(e) {
    const id = e.currentTarget.dataset.id;
    const target = this.data.adminList.find(a => a._id === id);
    if (!target) return;
    if (target.isSelf) {
      wx.showToast({ title: '为避免锁死，不能修改自己', icon: 'none' });
      return;
    }
    this.setData({ editingId: this.data.editingId === id ? '' : id, addMsg: '' });
  },

  // 阻止编辑面板冒泡
  onAdminPanelTap() {},

  onAdminNameInput(e) {
    const id = e.currentTarget.dataset.id;
    const adminList = this.data.adminList.map(a =>
      a._id === id ? { ...a, editName: (e.detail.value || '').trim() } : a
    );
    this.setData({ adminList });
  },

  toggleEditDept(e) {
    const id = e.currentTarget.dataset.id;
    const deptId = e.currentTarget.dataset.dept;
    const adminList = this.data.adminList.map(a => {
      if (a._id !== id) return a;
      const editDeptOptions = a.editDeptOptions.map(d =>
        d._id === deptId ? { ...d, checked: !d.checked } : d
      );
      return { ...a, editDeptOptions };
    });
    this.setData({ adminList });
  },

  async saveAdminScope(e) {
    const id = e.currentTarget.dataset.id;
    const target = this.data.adminList.find(a => a._id === id);
    if (!target || target.isSelf) {
      wx.showToast({ title: '不能修改自己的权限', icon: 'none' });
      return;
    }
    const deptIds = target.editDeptOptions.filter(d => d.checked).map(d => d._id);
    wx.showLoading({ title: '保存中' });
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'adminCheck',
        data: { action: 'updateAdminDept', id, deptIds, name: target.editName }
      });
      wx.hideLoading();
      if (result && result.ok) {
        wx.showToast({ title: result.msg || '已更新', icon: 'success' });
        this.setData({ editingId: '' });
        await this.loadAdminList();
      } else {
        wx.showToast({ title: (result && result.msg) || '保存失败', icon: 'none' });
      }
    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: '保存失败，请确认云函数已部署', icon: 'none' });
    }
  },

  removeAdmin(e) {
    const id = e.currentTarget.dataset.id;
    const target = this.data.adminList.find(a => a._id === id);
    if (!target || target.isSelf) {
      wx.showToast({ title: '不能移除自己', icon: 'none' });
      return;
    }
    const label = target.name || ('ID ' + target.idShort);
    wx.showModal({
      title: '移除管理员',
      content: '确定移除「' + label + '」的管理员权限吗？\n移除后对方将无法进入管理端。',
      confirmText: '移除',
      confirmColor: '#FF3B30',
      success: async (res) => {
        if (!res.confirm) return;
        wx.showLoading({ title: '处理中' });
        try {
          const { result } = await wx.cloud.callFunction({
            name: 'adminCheck',
            data: { action: 'removeAdmin', id }
          });
          wx.hideLoading();
          if (result && result.ok) {
            wx.showToast({ title: '已移除', icon: 'success' });
            await this.loadAdminList();
          } else {
            wx.showToast({ title: (result && result.msg) || '移除失败', icon: 'none' });
          }
        } catch (err) {
          wx.hideLoading();
          wx.showToast({ title: '移除失败，请确认云函数已部署', icon: 'none' });
        }
      }
    });
  },

  // 添加管理员
  onNewAdminInput(e) {
    this.setData({ newAdminId: (e.detail.value || '').trim(), addMsg: '' });
  },

  onNewAdminNameInput(e) {
    this.setData({ newAdminName: (e.detail.value || '').trim(), addMsg: '' });
  },

  toggleAdminDept(e) {
    const id = e.currentTarget.dataset.id;
    const deptOptions = this.data.deptOptions.map(d =>
      d._id === id ? { ...d, checked: !d.checked } : d
    );
    this.setData({ deptOptions });
  },

  async addAdmin() {
    const openid = this.data.newAdminId;
    if (!openid) {
      wx.showToast({ title: '请先粘贴对方 ID', icon: 'none' });
      return;
    }
    const deptIds = this.data.deptOptions.filter(d => d.checked).map(d => d._id);
    this.setData({ adding: true, addMsg: '' });
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'adminCheck',
        data: {
          action: 'addAdmin',
          openid,
          deptIds,
          name: this.data.newAdminName
        }
      });
      if (result && result.ok) {
        const deptOptions = this.data.deptOptions.map(d => ({ ...d, checked: false }));
        this.setData({
          newAdminId: '',
          newAdminName: '',
          addMsg: result.msg || '添加成功',
          deptOptions
        });
        wx.showToast({ title: '已添加为管理员', icon: 'success' });
        this.setData({ view: 'list' });
        await this.loadAdminList();
      } else {
        this.setData({ addMsg: (result && result.msg) || '添加失败' });
      }
    } catch (err) {
      console.error('添加管理员失败', err);
      this.setData({ addMsg: '添加失败，请确认 adminCheck 云函数已部署' });
    } finally {
      this.setData({ adding: false });
    }
  },

  // 管理员申请审批
  async approveAdminReq(e) {
    if (this.data.handlingReq) return;
    const id = e.currentTarget.dataset.id;
    const { confirm } = await wx.showModal({
      title: '同意申请',
      content: '通过后该同学将获得【全部部门】的管理权限。如需限定部门，请拒绝后返回列表手动添加。确定同意吗？'
    });
    if (!confirm) return;
    this.setData({ handlingReq: true });
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'adminCheck',
        data: { action: 'approveAdmin', id }
      });
      if (result && result.ok) {
        wx.showToast({ title: result.msg || '已同意', icon: 'success' });
      } else {
        wx.showModal({ title: '操作失败', content: (result && result.msg) || '请重试', showCancel: false });
      }
      await this.loadAdminRequests();
      await this.loadAdminList();
    } catch (err) {
      console.error('同意申请失败', err);
      wx.showModal({ title: '操作失败', content: '网络异常，请重试', showCancel: false });
    } finally {
      this.setData({ handlingReq: false });
    }
  },

  async rejectAdminReq(e) {
    if (this.data.handlingReq) return;
    const id = e.currentTarget.dataset.id;
    const { confirm } = await wx.showModal({
      title: '拒绝申请',
      content: '确定拒绝该同学的管理员申请吗？对方可再次提交。'
    });
    if (!confirm) return;
    this.setData({ handlingReq: true });
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'adminCheck',
        data: { action: 'rejectAdmin', id }
      });
      if (result && result.ok) {
        wx.showToast({ title: '已拒绝', icon: 'success' });
      } else {
        wx.showModal({ title: '操作失败', content: (result && result.msg) || '请重试', showCancel: false });
      }
      await this.loadAdminRequests();
    } catch (err) {
      console.error('拒绝申请失败', err);
      wx.showModal({ title: '操作失败', content: '网络异常，请重试', showCancel: false });
    } finally {
      this.setData({ handlingReq: false });
    }
  },

  // 开启申请微信提醒
  async enableAdminReqNotify() {
    if (!ADMIN_REQ_TMPL_ID) {
      wx.showModal({ title: '提醒未配置', content: '模板 ID 尚未填写', showCancel: false });
      return;
    }
    try {
      await wx.requestSubscribeMessage({ tmplIds: [ADMIN_REQ_TMPL_ID] });
      wx.showToast({ title: '已开启，可多点几次积累', icon: 'none' });
    } catch (err) {
      console.error('订阅提醒失败', err);
      wx.showToast({ title: '未能开启', icon: 'none' });
    }
  },

  formatDate(d) {
    const date = new Date(d);
    const pad = n => (n < 10 ? '0' + n : n);
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }
});
