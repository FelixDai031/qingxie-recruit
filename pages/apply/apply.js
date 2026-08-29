// pages/apply/apply.js —— 报名表单
const { db, getDepartments } = require('../../utils/cloud.js');

// 审核结果订阅消息模板 ID：
// 在 mp.weixin.qq.com 后台「功能 → 订阅消息」申请"审核结果通知"类模板后，
// 把模板 ID 填到这里。留空则不弹出订阅授权（功能关闭）。
const SUBSCRIBE_TMPL_ID = 'sReNVOM6bPCg3d-Kte1Mfr5RCSf6VKOv7OHory5nDXQ';

Page({
  data: {
    submitting: false,
    privacyAgree: false,
    departments: [],
    deptNames: [],
    deptIndex: 0,
    // 报名开关与防重复
    recruitOpen: true,
    dupExists: false,
    dupDeptName: '',
    checking: true,
    form: {
      name: '',
      stuId: '',
      college: '',
      major: '',
      phone: '',
      deptId: '',
      deptName: '',
      intro: ''
    }
  },

  async onLoad(options) {
    // 从缓存读取"待选部门"（部门详情页 switchTab 跳转前写入），兼容旧的 URL 参数方式
    const pendingId = wx.getStorageSync('pendingDeptId') || options.deptId || '';
    if (pendingId) wx.removeStorageSync('pendingDeptId');
    await this.initDepartments(pendingId);
    this.checkApplyStatus();
  },

  onShow() {
    // tabBar 页面：从部门详情页切回本页时只触发 onShow，这里兜底读取缓存
    const pendingId = wx.getStorageSync('pendingDeptId');
    if (pendingId) {
      wx.removeStorageSync('pendingDeptId');
      this.initDepartments(pendingId);
    }
    // 从"我的"页返回时刷新报名状态（可能刚被驳回/负责人改了开关）
    this.checkApplyStatus();
  },

  // 检查报名是否开放 + 当前用户是否已报过名
  async checkApplyStatus() {
    this.setData({ checking: true });
    try {
      const cfgRes = await wx.cloud.callFunction({
        name: 'adminCheck',
        data: { action: 'getConfig' }
      });
      const cfg = cfgRes.result || {};
      const recruitOpen = cfg.recruitOpen !== false;

      let dupExists = false;
      let dupDeptName = '';
      if (recruitOpen) {
        const dupRes = await wx.cloud.callFunction({
          name: 'adminCheck',
          data: { action: 'myApply' }
        });
        const dup = dupRes.result || {};
        if (dup.ok && dup.exists) {
          dupExists = true;
          dupDeptName = dup.deptName || '';
        }
      }
      this.setData({ recruitOpen, dupExists, dupDeptName, checking: false });
    } catch (err) {
      // 云函数异常时保持默认可报名，避免误拦截
      console.error('报名状态检查失败', err);
      this.setData({ checking: false });
    }
  },

  async initDepartments(selectedId) {
    const departments = await getDepartments();
    const deptNames = departments.map(d => d.name);
    const defaultDept = departments.find(d => d._id === selectedId) || departments[0] || {};
    // 同步 picker 的高亮位置，确保点开下拉时选中的正是当前部门
    const defaultIndex = departments.findIndex(d => d._id === defaultDept._id);

    this.setData({
      departments,
      deptNames,
      deptIndex: defaultIndex >= 0 ? defaultIndex : 0,
      'form.deptId': defaultDept._id || '',
      'form.deptName': defaultDept.name || ''
    });
  },

  onInput(e) {
    const { field } = e.currentTarget.dataset;
    this.setData({ [`form.${field}`]: e.detail.value });
  },

  onDeptChange(e) {
    const index = parseInt(e.detail.value, 10);
    const dept = this.data.departments[index];
    this.setData({
      deptIndex: index,
      'form.deptId': dept._id,
      'form.deptName': dept.name
    });
  },

  togglePrivacy() {
    this.setData({ privacyAgree: !this.data.privacyAgree });
  },

  showPrivacy() {
    wx.showModal({
      title: '个人信息授权及隐私保护说明',
      content: '为完成校青协招新报名，我们需要收集你的姓名、学号、学院、专业、手机号、自我介绍等个人信息，以及微信昵称和头像，仅用于招新联系、审核与展示用户资料，不会对外泄露或用于其他用途。报名即视为授权上述用途。',
      showCancel: false
    });
  },

  validate() {
    const { form } = this.data;
    if (!form.name.trim()) return '请填写姓名';
    if (!form.stuId.trim()) return '请填写学号';
    if (!form.college.trim()) return '请填写学院';
    if (!/^1[3-9]\d{9}$/.test(form.phone)) return '请填写正确的手机号';
    if (!form.deptId) return '请选择意向部门';
    if (form.intro.trim().length < 10) return '自我介绍至少 10 个字';
    return '';
  },

  async submit() {
    // 双重保险：提交前再查一次开关与重复报名
    try {
      const cfgRes = await wx.cloud.callFunction({
        name: 'adminCheck',
        data: { action: 'getConfig' }
      });
      if (cfgRes.result && cfgRes.result.recruitOpen === false) {
        wx.showModal({ title: '报名暂未开放', content: '本次招新报名已截止或尚未开始，请留意协会通知。', showCancel: false });
        this.setData({ recruitOpen: false });
        return;
      }
      const dupRes = await wx.cloud.callFunction({
        name: 'adminCheck',
        data: { action: 'myApply' }
      });
      const dup = dupRes.result || {};
      if (dup.ok && dup.exists) {
        this.setData({ dupExists: true, dupDeptName: dup.deptName || '' });
        wx.showModal({
          title: '你已提交过报名',
          content: '意向部门：' + (dup.deptName || '未知') + '。每位同学限报一次，如需修改请联系协会负责人。',
          showCancel: false
        });
        return;
      }
    } catch (err) {
      console.error('提交前检查失败', err);
      // 检查失败不拦截提交，避免因网络问题挡住正常报名
    }

    const msg = this.validate();
    if (msg) {
      wx.showToast({ title: msg, icon: 'none' });
      return;
    }

    this.setData({ submitting: true });

    try {
      // 请求订阅授权：必须在用户点击（提交按钮）回调内调用才有效。
      // 用户拒绝或出错都不影响正常提交。
      if (SUBSCRIBE_TMPL_ID) {
        try {
          await wx.requestSubscribeMessage({ tmplIds: [SUBSCRIBE_TMPL_ID] });
        } catch (e) {
          console.warn('订阅授权未完成', e);
        }
      }

      await db().collection('applications').add({
        data: {
          ...this.data.form,
          status: 'pending',
          statusText: '待审核',
          createTime: db().serverDate()
        }
      });

      wx.showModal({
        title: '报名成功',
        content: SUBSCRIBE_TMPL_ID
          ? '你的报名信息已提交，审核结果将通过微信服务通知发送给你。'
          : '你的报名信息已提交，可在“我的”页面查看审核进度。',
        showCancel: false,
        success: () => {
          wx.switchTab({ url: '/pages/mine/mine' });
        }
      });
    } catch (err) {
      console.error('提交失败', err);
      wx.showToast({ title: '提交失败，请稍后重试', icon: 'none' });
    } finally {
      this.setData({ submitting: false });
    }
  }
});
