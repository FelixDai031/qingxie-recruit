// pages/index/index.js —— 招新首页
const { getDepartments } = require('../../utils/cloud.js');

Page({
  data: {
    loading: true,
    departments: [],
    recruitTag: '',
    faqList: [
      { q: '可以修改报名信息吗？', a: '每位同学限报一次，提交后如需修改请联系协会负责人处理；若报名被驳回，可重新提交。', open: false },
      { q: '可以报多个部门吗？', a: '每位同学限报一个第一志愿部门，面试阶段可与面试官沟通调剂意愿。', open: false },
      { q: '报名需要缴费吗？', a: '青年志愿者协会招新全程不收取任何费用，请警惕任何收费要求。', open: false },
      { q: '如何收到面试通知？', a: '请保持手机畅通，审核通过后我们将通过小程序订阅消息和短信通知你。', open: false }
    ]
  },

  onLoad() {
    // 按当前日期自动计算招新批次（8-12月为秋季，1-7月为春季），长期使用无需改代码
    this.setData({ recruitTag: this.getRecruitTag() });
    this.loadDepartments();
  },

  getRecruitTag() {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1; // 1-12
    return month >= 8 ? year + ' 秋季招新' : year + ' 春季招新';
  },

  async loadDepartments() {
    const departments = await getDepartments();
    this.setData({ departments, loading: false });
  },

  goDept(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/department/department?id=${id}` });
  },

  toggleFaq(e) {
    const { index } = e.currentTarget.dataset;
    const key = `faqList[${index}].open`;
    this.setData({ [key]: !this.data.faqList[index].open });
  },

  // 转发到班级群
  onShareAppMessage() {
    const tag = this.data.recruitTag || '招新';
    return {
      title: '西安邮电大学校青年志愿者协会' + tag + '进行中，快来报名！',
      path: '/pages/index/index'
    };
  }
});
