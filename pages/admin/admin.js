// pages/admin/admin.js —— 管理员审核页

// 管理员申请微信提醒的模板 ID（与云函数 ADMIN_REQ_TMPL_ID 保持一致；留空 = 功能关闭）
const ADMIN_REQ_TMPL_ID = 'StX_veM_rCFpbFDjtsJkAp8_RLi2iUCmE71SafTiFLU';

Page({
  data: {
    loading: true,
    isAdmin: false,
    filter: 'pending',
    list: [],
    allList: [],
    newAdminId: '',
    newAdminName: '',
    adding: false,
    addMsg: '',
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
    // 部门级权限：我的管理范围 / 添加管理员时的部门勾选
    myDeptNames: '',
    isAllDept: true,
    deptOptions: [],
    adminDeptIds: [],
    // 管理员申请审批
    adminRequests: [],
    handlingReq: false,
    // 管理员名单（可修改管理范围 / 备注姓名 / 移除）
    adminList: []
  },

  // 切换顶部标签页
  switchAdminTab(e) {
    const tab = e.currentTarget.dataset.tab;
    if (tab === this.data.adminTab) return;
    this.setData({ adminTab: tab });
    // 进入管理设置时刷新统计与开关状态，并自动请求一次订阅授权（积累提醒次数）
    if (tab === 'manage') {
      this.loadStats();
      this.loadConfig();
      this.loadDeptOptions();
      this.loadAdminRequests();
      this.loadAdminList();
      this.autoSubscribeNotify();
    }
  },

  // 进入管理设置时自动请求订阅授权（利用用户本次点击，静默积累提醒次数）
  // 说明：微信一次性订阅每次授权只能发一条，靠高频点击自动积累，接近"长期提醒"体验
  autoSubscribeNotify() {
    if (!ADMIN_REQ_TMPL_ID) return;
    wx.requestSubscribeMessage({
      tmplIds: [ADMIN_REQ_TMPL_ID],
      complete: () => {}
      // 用户点"允许"则积累一次；勾选"总是保持以上选择"后不再弹窗、自动积累
    });
  },

  // 加载待审批的管理员申请
  async loadAdminRequests() {
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'adminCheck',
        data: { action: 'listAdminRequests' }
      });
      if (result && result.ok) {
        const list = (result.data || []).map(it => ({
          ...it,
          idShort: (it.openid || '').slice(0, 12) + '…',
          timeText: this.formatDate(it.createTime)
        }));
        this.setData({ adminRequests: list });
      }
    } catch (err) {
      console.error('管理员申请加载失败', err);
    }
  },

  // 同意管理员申请（默认全部部门权限）
  async approveAdminReq(e) {
    if (this.data.handlingReq) return;
    const id = e.currentTarget.dataset.id;
    const { confirm } = await wx.showModal({
      title: '同意申请',
      content: '通过后该同学将获得【全部部门】的管理权限。如需限定部门，请拒绝后用下方「添加管理员」勾选部门添加。确定同意吗？'
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
    } catch (err) {
      console.error('同意申请失败', err);
      wx.showModal({ title: '操作失败', content: '网络异常，请重试', showCancel: false });
    } finally {
      this.setData({ handlingReq: false });
    }
  },

  // 拒绝管理员申请
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

  // 加载部门选项（用于添加管理员时勾选管理范围）
  async loadDeptOptions() {
    if (this.data.deptOptions.length) return;
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'adminCheck',
        data: { action: 'listDepts' }
      });
      if (result && result.ok) {
        const deptOptions = (result.data || []).map(d => ({
          _id: d._id,
          name: d.name,
          checked: false
        }));
        this.setData({ deptOptions });
      }
    } catch (err) {
      console.error('部门选项加载失败', err);
    }
  },

  // 勾选/取消部门（添加管理员的管理范围）
  toggleAdminDept(e) {
    const id = e.currentTarget.dataset.id;
    const deptOptions = this.data.deptOptions.map(d =>
      d._id === id ? { ...d, checked: !d.checked } : d
    );
    this.setData({
      deptOptions,
      adminDeptIds: deptOptions.filter(d => d.checked).map(d => d._id)
    });
  },

  // 开启管理员申请的微信提醒（负责人自助订阅；每次授权可收一条，可多次点击积累）
  async enableAdminReqNotify() {
    if (!ADMIN_REQ_TMPL_ID) {
      wx.showModal({
        title: '提醒未配置',
        content: '提醒模板 ID 尚未填写（admin.js 与 adminCheck 云函数的 ADMIN_REQ_TMPL_ID），填好后此按钮即可用。',
        showCancel: false
      });
      return;
    }
    try {
      await wx.requestSubscribeMessage({ tmplIds: [ADMIN_REQ_TMPL_ID] });
      wx.showToast({ title: '已开启，可多点几次积累', icon: 'none' });
    } catch (err) {
      console.error('订阅提醒失败', err);
      wx.showToast({ title: '未能开启，请重试', icon: 'none' });
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

  onNewAdminInput(e) {
    this.setData({ newAdminId: (e.detail.value || '').trim(), addMsg: '' });
  },

  onNewAdminNameInput(e) {
    this.setData({ newAdminName: (e.detail.value || '').trim(), addMsg: '' });
  },

  async addAdmin() {
    const openid = this.data.newAdminId;
    if (!openid) {
      wx.showToast({ title: '请先粘贴对方 ID', icon: 'none' });
      return;
    }
    this.setData({ adding: true, addMsg: '' });
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'adminCheck',
        data: {
          action: 'addAdmin',
          openid,
          deptIds: this.data.adminDeptIds,
          name: this.data.newAdminName
        }
      });
      if (result && result.ok) {
        // 成功后清空输入与部门勾选
        const deptOptions = this.data.deptOptions.map(d => ({ ...d, checked: false }));
        this.setData({
          newAdminId: '',
          newAdminName: '',
          addMsg: result.msg || '添加成功',
          deptOptions,
          adminDeptIds: []
        });
        wx.showToast({ title: '已添加为管理员', icon: 'success' });
        this.loadAdminList();
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

  // ===== 管理员名单：查看 / 改管理范围 / 改备注名 / 移除 =====

  // 加载名单（先确保部门选项已就绪，供编辑区勾选使用）
  async loadAdminList() {
    try {
      await this.loadDeptOptions();
      const { result } = await wx.cloud.callFunction({
        name: 'adminCheck',
        data: { action: 'listAdmins' }
      });
      if (!result || !result.ok) return;
      const deptOptions = this.data.deptOptions;
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
        const colors = ['#FF7A59', '#4C6FFF', '#00C9A7', '#9B59B6', '#F59E0B', '#EC4899', '#10B981'];
        return {
          ...a,
          idShort: (a.openid || '').slice(-8),
          displayName,
          firstChar: displayName.charAt(0).toUpperCase() || 'A',
          avatarColor: colors[idx % colors.length],
          scopeSummary,
          editing: false,
          saving: false,
          editMsg: '',
          editName: a.name || '',
          editDeptIds: (a.deptIds || []).slice(),
          editDeptOptions: deptOptions.map(d => ({
            _id: d._id,
            name: d.name,
            checked: (a.deptIds || []).indexOf(d._id) !== -1
          }))
        };
      });
      this.setData({ adminList });
    } catch (err) {
      console.error('管理员名单加载失败', err);
    }
  },

  // 小工具：只更新名单中某一项的部分字段
  setAdminField(id, patch) {
    const adminList = this.data.adminList.map(a =>
      a._id === id ? { ...a, ...patch } : a
    );
    this.setData({ adminList });
  },

  // 展开 / 收起编辑区（展开时重置为当前已保存的值；点击整行触发）
  toggleEditAdmin(e) {
    const id = e.currentTarget.dataset.id;
    const target = this.data.adminList.find(a => a._id === id);
    if (!target) return;
    if (target.isSelf) {
      wx.showToast({ title: '为避免锁死，不能修改自己的权限', icon: 'none' });
      return;
    }
    const adminList = this.data.adminList.map(a => {
      if (a._id !== id) return { ...a, editing: false, editMsg: '' };
      if (a.editing) return { ...a, editing: false, editMsg: '' };
      return {
        ...a,
        editing: true,
        editMsg: '',
        editName: a.name || '',
        editDeptIds: (a.deptIds || []).slice(),
        editDeptOptions: (a.editDeptOptions || []).map(d => ({
          ...d,
          checked: (a.deptIds || []).indexOf(d._id) !== -1
        }))
      };
    });
    this.setData({ adminList });
  },

  // 阻止编辑面板内部空白处冒泡收起
  onAdminPanelTap() {},

  cancelEditAdmin(e) {
    this.setAdminField(e.currentTarget.dataset.id, { editing: false, editMsg: '' });
  },

  onAdminNameInput(e) {
    this.setAdminField(e.currentTarget.dataset.id, {
      editName: (e.detail.value || '').trim()
    });
  },

  toggleEditDept(e) {
    const id = e.currentTarget.dataset.id;
    const deptId = e.currentTarget.dataset.dept;
    const adminList = this.data.adminList.map(a => {
      if (a._id !== id) return a;
      const editDeptOptions = a.editDeptOptions.map(d =>
        d._id === deptId ? { ...d, checked: !d.checked } : d
      );
      return {
        ...a,
        editDeptOptions,
        editDeptIds: editDeptOptions.filter(d => d.checked).map(d => d._id)
      };
    });
    this.setData({ adminList });
  },

  async saveAdminScope(e) {
    const id = e.currentTarget.dataset.id;
    const target = this.data.adminList.find(a => a._id === id);
    if (!target) return;
    if (target.isSelf) {
      wx.showToast({ title: '不能修改自己的权限', icon: 'none' });
      return;
    }
    this.setAdminField(id, { saving: true, editMsg: '' });
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'adminCheck',
        data: {
          action: 'updateAdminDept',
          id,
          deptIds: target.editDeptIds,
          name: target.editName
        }
      });
      if (result && result.ok) {
        wx.showToast({ title: result.msg || '已更新', icon: 'success' });
        await this.loadAdminList();
      } else {
        this.setAdminField(id, {
          saving: false,
          editMsg: (result && result.msg) || '保存失败'
        });
      }
    } catch (err) {
      console.error('保存管理范围失败', err);
      this.setAdminField(id, { saving: false, editMsg: '保存失败，请确认云函数已部署' });
    }
  },

  removeAdmin(e) {
    const id = e.currentTarget.dataset.id;
    const target = this.data.adminList.find(a => a._id === id);
    if (!target) return;
    if (target.isSelf) {
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
        try {
          const { result } = await wx.cloud.callFunction({
            name: 'adminCheck',
            data: { action: 'removeAdmin', id }
          });
          if (result && result.ok) {
            wx.showToast({ title: '已移除', icon: 'success' });
            await this.loadAdminList();
          } else {
            wx.showToast({ title: (result && result.msg) || '移除失败', icon: 'none' });
          }
        } catch (err) {
          console.error('移除管理员失败', err);
          wx.showToast({ title: '移除失败，请确认云函数已部署', icon: 'none' });
        }
      }
    });
  }
});
