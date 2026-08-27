export type Locale = "zh" | "en";

export const localeOptions: Locale[] = ["zh", "en"];

export const localeLabels: Record<Locale, string> = {
  zh: "中文",
  en: "English",
};

export type Dictionary = {
  common: {
    appName: string;
    appTagline: string;
    save: string;
    cancel: string;
    delete: string;
    confirm: string;
    loading: string;
    saving: string;
    retry: string;
    back: string;
    next: string;
    submit: string;
    search: string;
    refresh: string;
    logout: string;
    credits: string;
    adminBadge: string;
  };
  auth: {
    loginTitle: string;
    registerTitle: string;
    loginDesc: string;
    registerDesc: string;
    email: string;
    password: string;
    name: string;
    namePlaceholder: string;
    emailPlaceholder: string;
    passwordPlaceholderLogin: string;
    passwordPlaceholderRegister: string;
    loginBtn: string;
    registerBtn: string;
    toLogin: string;
    toRegister: string;
    loginLink: string;
    registerLink: string;
    processing: string;
  };
  nav: {
    quickStart: string;
    batchCreate: string;
    history: string;
    xiaohongshu: string;
    advancedCreate: string;
    apiMonitor: string;
    aiConfig: string;
    myKeys: string;
  };
  credits: {
    title: string;
    desc: string;
    addTitle: string;
    addDesc: string;
    nameLabel: string;
    namePlaceholder: string;
    baseUrlLabel: string;
    baseUrlPlaceholder: string;
    apiKeyLabel: string;
    apiKeyPlaceholder: string;
    addBtn: string;
    listTitle: string;
    empty: string;
    enabled: string;
    disabled: string;
    disable: string;
    enable: string;
    addedToast: string;
    confirmDelete: string;
  };
  recharge: {
    title: string;
    desc: string;
    packages: string;
    customAmount: string;
    amount: string;
    pay: string;
    payWechat: string;
    payAlipay: string;
    payNative: string;
    processing: string;
    scanTip: string;
    history: string;
    historyEmpty: string;
    colAmount: string;
    colStatus: string;
    colTime: string;
    statusPending: string;
    statusPaid: string;
    statusFailed: string;
    statusCanceled: string;
  };
  errors: {
    unauthorized: string;
    forbidden: string;
    notFound: string;
    insufficientCredits: string;
    providerNotConfigured: string;
    needAdmin: string;
  };
};
