// pages/deptEdit/deptEdit.js —— 管理员编辑部门简介（先选部门，再编辑）

const MAX_INTRO = 500;

Page({
  data: {
    deptList: [],      // 部门原始数据（含 _id）
    deptNames: [],     // 选择器展示用的部门名数组
    deptIndex: -1,     // 当前选中下标
    deptId: '',        // 当前选中部门 _id
    deptName: '',
    intro: '',
    slogan: '',
    photos: [],        // 当前部门活动相册（fileID 数组）
    uploading: false,
    saving: false
  },

  async onLoad() {
    await this.loadDepts();
  },

  // 加载部门列表（服务端读取，不受客户端集合权限限制；部门管理员只显示自己可管理的部门）
  async loadDepts() {
    wx.showLoading({ title: '加载中' });
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'adminCheck',
        data: { action: 'listDepts' }
      });
      let list = (result && result.data) || [];

      // 按当前管理员的管理范围过滤（check 返回 null = 全部部门）
      try {
        const checkRes = await wx.cloud.callFunction({
          name: 'adminCheck',
          data: { action: 'check' }
        });
        const allowed = checkRes.result && checkRes.result.deptNames;
        if (Array.isArray(allowed) && allowed.length > 0) {
          list = list.filter(d => allowed.includes(d.name));
        }
      } catch (e) {
        // 忽略，退化为显示全部（保存时云端仍会拦截）
      }

      wx.hideLoading();
      if (list.length === 0) {
        wx.showToast({ title: (result && result.msg) || '暂无可管理的部门', icon: 'none' });
        return;
      }
      this.setData({
        deptList: list,
        deptNames: list.map(d => d.name || '未命名部门')
      });
    } catch (err) {
      wx.hideLoading();
      console.error('加载部门列表失败', err);
      wx.showToast({ title: '部门列表加载失败', icon: 'none' });
    }
  },

  // 选择部门后，加载该部门详情到表单
  async onPickDept(e) {
    const index = Number(e.detail.value);
    const dept = this.data.deptList[index];
    if (!dept) return;
    this.setData({ deptIndex: index, deptId: dept._id, deptName: dept.name, intro: '', slogan: '' });

    wx.showLoading({ title: '加载中' });
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'adminCheck',
        data: { action: 'getDept', id: dept._id }
      });
      wx.hideLoading();
      const data = result && result.data;
      if (!data) {
        wx.showToast({ title: (result && result.msg) || '部门读取失败', icon: 'none' });
        return;
      }
      this.setData({
        intro: data.intro || '',
        slogan: data.slogan || '',
        photos: Array.isArray(data.photos) ? data.photos : []
      });
      wx.setNavigationBarTitle({ title: '编辑 · ' + (data.name || '部门') });
    } catch (err) {
      wx.hideLoading();
      console.error('加载部门详情失败', err);
      wx.showToast({ title: '部门读取失败', icon: 'none' });
    }
  },

  // ===== 活动相册管理 =====

  // 添加照片：选图 → 客户端直传云存储 → 云函数校验权限后写入部门数据
  async addPhoto() {
    if (this.data.uploading || !this.data.deptId) return;
    if (this.data.photos.length >= 20) {
      wx.showToast({ title: '相册最多 20 张', icon: 'none' });
      return;
    }
    try {
      const choose = await wx.chooseMedia({
        count: 1,
        mediaType: ['image'],
        sourceType: ['album', 'camera'],
        sizeType: ['compressed']
      });
      const tempFile = choose.tempFiles && choose.tempFiles[0];
      if (!tempFile) return;

      this.setData({ uploading: true });
      wx.showLoading({ title: '上传中' });

      const ext = (tempFile.tempFilePath.split('.').pop() || 'jpg').toLowerCase();
      const cloudPath = 'dept-photos/' + this.data.deptId + '/' + Date.now() + '-' + Math.floor(Math.random() * 10000) + '.' + ext;
      const upRes = await wx.cloud.uploadFile({
        cloudPath,
        filePath: tempFile.tempFilePath
      });

      const { result } = await wx.cloud.callFunction({
        name: 'adminCheck',
        data: { action: 'addDeptPhoto', deptId: this.data.deptId, fileID: upRes.fileID }
      });
      wx.hideLoading();
      if (result && result.ok) {
        this.setData({ photos: result.photos || [] });
        wx.showToast({ title: '上传成功', icon: 'success' });
      } else {
        // 写入失败，清理刚上传的孤儿文件
        try { await wx.cloud.deleteFile({ fileList: [upRes.fileID] }); } catch (e) { /* 忽略 */ }
        wx.showModal({ title: '上传失败', content: (result && result.msg) || '请重试', showCancel: false });
      }
    } catch (err) {
      wx.hideLoading();
      if (err && /cancel/i.test(err.errMsg || '')) return; // 用户取消选图
      console.error('上传照片失败', err);
      // 展示具体错误，便于定位（存储权限 / 网络 / 云函数未部署）
      const detail = String((err && (err.errMsg || err.msg)) || err || '未知错误').slice(0, 200);
      wx.showModal({
        title: '上传失败',
        content: detail,
        showCancel: false
      });
    } finally {
      this.setData({ uploading: false });
    }
  },

  // 删除照片（带确认）
  async removePhoto(e) {
    if (this.data.uploading) return;
    const fileID = e.currentTarget.dataset.id;
    const { confirm } = await wx.showModal({
      title: '删除照片',
      content: '确定从部门相册中删除这张照片吗？',
      confirmText: '删除',
      confirmColor: '#FA5151'
    });
    if (!confirm) return;

    wx.showLoading({ title: '删除中' });
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'adminCheck',
        data: { action: 'removeDeptPhoto', deptId: this.data.deptId, fileID }
      });
      wx.hideLoading();
      if (result && result.ok) {
        this.setData({ photos: result.photos || [] });
        wx.showToast({ title: '已删除', icon: 'success' });
      } else {
        wx.showModal({ title: '删除失败', content: (result && result.msg) || '请重试', showCancel: false });
      }
    } catch (err) {
      wx.hideLoading();
      console.error('删除照片失败', err);
      wx.showModal({ title: '删除失败', content: '网络异常，请重试', showCancel: false });
    }
  },

  onIntroInput(e) {
    this.setData({ intro: e.detail.value });
  },

  onSloganInput(e) {
    this.setData({ slogan: e.detail.value });
  },

  async save() {
    if (this.data.saving) return;
    const { deptId, intro, slogan } = this.data;
    if (!deptId) {
      wx.showToast({ title: '请先选择部门', icon: 'none' });
      return;
    }
    if (intro.length > MAX_INTRO) {
      wx.showToast({ title: `简介不超过 ${MAX_INTRO} 字`, icon: 'none' });
      return;
    }
    if (slogan.length > 50) {
      wx.showToast({ title: '标语不超过 50 字', icon: 'none' });
      return;
    }

    this.setData({ saving: true });
    wx.showLoading({ title: '保存中' });
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'adminCheck',
        data: { action: 'updateDept', id: deptId, intro, slogan }
      });
      wx.hideLoading();
      if (result && result.ok) {
        wx.showToast({ title: '已保存', icon: 'success' });
        setTimeout(() => wx.navigateBack(), 600);
      } else {
        wx.showModal({
          title: '保存失败',
          content: (result && result.msg) || '未知错误',
          showCancel: false
        });
        this.setData({ saving: false });
      }
    } catch (err) {
      wx.hideLoading();
      console.error('保存失败', err);
      wx.showModal({
        title: '保存失败',
        content: '请确认 adminCheck 云函数已部署',
        showCancel: false
      });
      this.setData({ saving: false });
    }
  }
});
