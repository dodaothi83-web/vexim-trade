import type { Locale } from "./config";

/**
 * Từ điển khu vực tài khoản (đăng nhập, đăng ký, quên/đặt lại mật khẩu).
 *
 * `en` là bản gốc: kiểu dữ liệu suy ra từ chính nó nên bản `vi` thiếu hay thừa khoá đều
 * là lỗi biên dịch, không phải lỗi phát hiện muộn trên giao diện.
 *
 * Giữ tiếng Việt ở đây (không xoá) để bản dịch không bị lạc khi sửa câu chữ. Thông báo lỗi
 * từ server action và API vẫn là tiếng Việt cho tới khi chuyển nốt phần đó.
 */
const en = {
  shell: {
    languageLabel: "Language",
    portalName: "Supplier portal",
    privacy: "Privacy Policy",
    terms: "Terms of Service",
  },
  login: {
    title: "Sign in",
    subtitle: "Manage your company profile, products and buyer requests.",
    email: "Email",
    emailPlaceholder: "name@company.com",
    password: "Password",
    showPassword: "Show password",
    hidePassword: "Hide password",
    forgotPassword: "Forgot password?",
    submit: "Sign in",
    or: "or",
    google: "Continue with Google",
    challengeMissing: "Please complete the security check.",
    genericError: "Could not sign in right now. Please try again.",
    setupNotice: "No account exists yet.",
    setupLink: "Create the first admin account",
    noSupplierAccount: "This email has no supplier account.",
    registerHere: "Register here.",
    noAccount: "No company account yet?",
    registerFree: "Register free",
    buyerQuestion: "Buying?",
    sendQuoteRequest: "Send a quote request",
    noSignInNeeded: "without signing in",
    orSeeTypes: "or",
    seeAccountTypes: "see the account types",
    reasonTitles: {
      not_found: "Signed in, but the account is missing from app_users",
      locked: "Account temporarily locked",
      unreadable: "The server cannot read the app_users table",
    },
    reasonBodies: {
      not_found:
        "The session is valid but no matching row exists. Usually the server talks to Supabase with the anon key while app_users has Row Level Security enabled. Add SUPABASE_SERVICE_ROLE_KEY and restart the app. Otherwise the account was deleted or its email changed.",
      locked: "Ask an administrator to unlock it in Settings, Users and permissions.",
      unreadable:
        "Usually app_users has Row Level Security enabled but the Supabase key cannot bypass it. Add SUPABASE_SERVICE_ROLE_KEY (the service_role key, not anon) and restart the app. Do not disable RLS to keep using the anon key: this table stores password hashes.",
    },
    oauth: {
      unavailable: "Google sign-in is not configured, or Supabase is unreachable. Sign in with your password instead.",
      origin: "This domain is not configured for Google sign-in. Ask the Vexim administrator.",
      cancelled: "Google sign-in was cancelled or the session expired. Please try again.",
      unverified: "Google did not confirm the email address or returned no valid identity.",
      existing: "This email already has an account. Choose Sign in with Google here.",
      failed: "Google sign-in could not be completed. Please try again.",
      invalid: "The Google sign-in request was invalid.",
      rate_limited: "Too many attempts. Please try again later.",
    },
    shellCaption: "Sign in to manage your company profile and buyer requests.",
    shellPoints: [
      "For suppliers and the Vexim team.",
      "Buyers do not need an account to send a quote request.",
      "Buyer contact details are shared only when the buyer approves an introduction.",
    ],
  },
  register: {
    metaTitle: "Create an account | Veximtrade",
    legend: "Which account would you like to create?",
    buyerTitle: "Buyer",
    buyerSummary: "Create a free buyer account with your email. No password needed.",
    supplierTitle: "Supplier",
    supplierSummary: "Sell to international buyers. Free to join, verified within one working day.",
    continue: "Continue",
    alreadyHaveAccount: "Already have an account?",
    signIn: "Sign in",
    buyerNoteLead: "Buyer accounts",
    buyerNote:
      "are free to create with your email, without a password.",
    supplierNoteLead: "Supplier accounts",
    supplierNote:
      "are free to open and verified within one working day; once your profile is approved you list products and receive quote requests. The supplier application form is in Vietnamese.",
    shellCaption: "Meet the team that checks the factory before you do.",
    shellPoints: [
      "Buyers: send a request for a quote and get offers from matched Vietnamese suppliers.",
      "Suppliers: sign up free, get verified within one working day, then list products and receive quote requests.",
      "Buyers pay nothing and contract directly with the supplier they choose.",
    ],
  },
  supplierRegister: {
    metaTitle: "Create a supplier account",
    step: "Supplier · Step 1 of 2",
    title: "Create an account",
    note: "Profiles are verified within one working day. Once approved, you list products and receive quote requests.",
    loginQuestion: "Already have an account?",
    login: "Sign in",
    buyerQuestion: "Buying?",
    sendQuoteRequest: "Send a quote request",
    noSignInNeeded: "without an account, or",
    changeType: "change the account type",
    shellCaption: "Sell to international buyers",
    shellLede: "Sign up free in a few minutes. Complete your profile and you can list products and receive quote requests.",
    shellPoints: [
      "Sign up quickly with email or Google",
      "Add your business details and upload your business licence",
      "Your profile is verified within one working day, so buyers trust you sooner",
    ],
    oauth: {
      unavailable: "Google sign-up is not configured on this domain. You can create an account with email.",
      origin: "This domain is not allowed to use Google sign-up. Please use email.",
      cancelled: "Google sign-up was cancelled or expired. Please try again.",
      unverified: "Google did not confirm the email address. Verify it and try again.",
      failed: "Google sign-up could not be completed. Please try again or use email.",
      rate_limited: "Too many attempts. Please try again later.",
    },
    form: {
      email: "Sign-in email",
      password: "Password",
      passwordHint: "8 to 128 characters, with both letters and numbers.",
      showPassword: "Show password",
      hidePassword: "Hide password",
      consent: "I agree to create an account and submit a company profile for review.",
      submit: "Create account with email",
      submitting: "Creating the account…",
      goToLogin: "Go to the sign-in page",
      challengeMissing: "Please complete the security check.",
      genericError: "Could not reach the server. Please try again.",
      or: "or",
      google: "Continue with Google",
      googleNoteBefore:
        "Continuing with Google means you agree to create a supplier account and submit a company profile. Google only confirms the email; you still complete the company profile and wait for access to open. See the",
      googleNotePrivacy: "Privacy Policy",
      googleNoteBetween: "and the",
      googleNoteTerms: "Terms of Service",
      googleNoteAfter: ".",
    },
  },
  forgot: {
    title: "Forgot password",
    subtitle: "Enter your account email. We send a reset link that works for 30 minutes.",
    submit: "Send the reset link",
    challengeMissing: "Please complete the security check.",
    failed: "Could not send the request. Please try again.",
    sent: "Reset instructions sent.",
    networkError: "Could not send the request. Check the connection and try again.",
    backToLogin: "Back to sign in",
    linkToLogin: "Go to the sign-in page",
  },
  reset: {
    title: "Reset password",
    subtitle: "Enter a new password for",
    newPassword: "New password",
    newPasswordPlaceholder: "At least 8 characters, letters and numbers",
    repeatPassword: "Repeat the new password",
    submit: "Save the new password",
    challengeMissing: "Please complete the security check.",
    failed: "The password could not be reset. Please try again.",
    done: "Password reset.",
    networkError: "Could not send the request. Check the connection and try again.",
    loginNow: "Sign in now",
    backToLogin: "Back to sign in",
    resend: "Send another reset request",
    expired: "This reset link expired (older than 30 minutes).",
    invalid: "This reset link is invalid or missing.",
  },
} as const;

type AuthMessages = {
  shell: { languageLabel: string; portalName: string; privacy: string; terms: string };
  login: {
    title: string;
    subtitle: string;
    email: string;
    emailPlaceholder: string;
    password: string;
    showPassword: string;
    hidePassword: string;
    forgotPassword: string;
    submit: string;
    or: string;
    google: string;
    challengeMissing: string;
    genericError: string;
    setupNotice: string;
    setupLink: string;
    noSupplierAccount: string;
    registerHere: string;
    noAccount: string;
    registerFree: string;
    buyerQuestion: string;
    sendQuoteRequest: string;
    noSignInNeeded: string;
    orSeeTypes: string;
    seeAccountTypes: string;
    reasonTitles: { not_found: string; locked: string; unreadable: string };
    reasonBodies: { not_found: string; locked: string; unreadable: string };
    oauth: {
      unavailable: string;
      origin: string;
      cancelled: string;
      unverified: string;
      existing: string;
      failed: string;
      invalid: string;
      rate_limited: string;
    };
    shellCaption: string;
    shellPoints: readonly string[];
  };
  register: {
    metaTitle: string;
    legend: string;
    buyerTitle: string;
    buyerSummary: string;
    supplierTitle: string;
    supplierSummary: string;
    continue: string;
    alreadyHaveAccount: string;
    signIn: string;
    buyerNoteLead: string;
    buyerNote: string;
    supplierNoteLead: string;
    supplierNote: string;
    shellCaption: string;
    shellPoints: readonly string[];
  };
  supplierRegister: {
    metaTitle: string;
    step: string;
    title: string;
    note: string;
    loginQuestion: string;
    login: string;
    buyerQuestion: string;
    sendQuoteRequest: string;
    noSignInNeeded: string;
    changeType: string;
    shellCaption: string;
    shellLede: string;
    shellPoints: readonly string[];
    oauth: {
      unavailable: string;
      origin: string;
      cancelled: string;
      unverified: string;
      failed: string;
      rate_limited: string;
    };
    form: {
      email: string;
      password: string;
      passwordHint: string;
      showPassword: string;
      hidePassword: string;
      consent: string;
      submit: string;
      submitting: string;
      goToLogin: string;
      challengeMissing: string;
      genericError: string;
      or: string;
      google: string;
      googleNoteBefore: string;
      googleNotePrivacy: string;
      googleNoteBetween: string;
      googleNoteTerms: string;
      googleNoteAfter: string;
    };
  };
  forgot: {
    title: string;
    subtitle: string;
    submit: string;
    challengeMissing: string;
    failed: string;
    sent: string;
    networkError: string;
    backToLogin: string;
    linkToLogin: string;
  };
  reset: {
    title: string;
    subtitle: string;
    newPassword: string;
    newPasswordPlaceholder: string;
    repeatPassword: string;
    submit: string;
    challengeMissing: string;
    failed: string;
    done: string;
    networkError: string;
    loginNow: string;
    backToLogin: string;
    resend: string;
    expired: string;
    invalid: string;
  };
};

const vi: AuthMessages = {
  shell: {
    languageLabel: "Ngôn ngữ",
    portalName: "Cổng nhà cung cấp",
    privacy: "Chính sách bảo mật",
    terms: "Điều khoản sử dụng",
  },
  login: {
    title: "Đăng nhập",
    subtitle: "Quản lý hồ sơ doanh nghiệp, sản phẩm và yêu cầu báo giá từ người mua.",
    email: "Email",
    emailPlaceholder: "email@congty.com",
    password: "Mật khẩu",
    showPassword: "Hiện mật khẩu",
    hidePassword: "Ẩn mật khẩu",
    forgotPassword: "Quên mật khẩu?",
    submit: "Đăng nhập",
    or: "hoặc",
    google: "Đăng nhập với Google",
    challengeMissing: "Vui lòng hoàn tất bước kiểm tra bảo mật.",
    genericError: "Không đăng nhập được lúc này. Vui lòng thử lại.",
    setupNotice: "Hệ thống chưa có tài khoản nào.",
    setupLink: "Tạo tài khoản quản trị đầu tiên",
    noSupplierAccount: "Email này chưa có tài khoản nhà cung cấp.",
    registerHere: "Đăng ký tại đây.",
    noAccount: "Doanh nghiệp chưa có tài khoản?",
    registerFree: "Đăng ký miễn phí",
    buyerQuestion: "Bạn là người mua?",
    sendQuoteRequest: "Gửi yêu cầu báo giá",
    noSignInNeeded: "không cần đăng nhập",
    orSeeTypes: "hoặc",
    seeAccountTypes: "xem hai loại tài khoản",
    reasonTitles: {
      not_found: "Phiên đăng nhập hợp lệ nhưng không tìm thấy tài khoản trong bảng app_users",
      locked: "Tài khoản đã bị tạm khoá",
      unreadable: "Máy chủ không đọc được bảng app_users",
    },
    reasonBodies: {
      not_found:
        "Hai khả năng: máy chủ đang dùng khoá anon trong khi app_users bật Row Level Security, hoặc tài khoản vừa bị xoá hay đổi email. Thêm SUPABASE_SERVICE_ROLE_KEY rồi khởi động lại app.", // copy-allow: đoạn giải thích dài, hiển thị thành khối riêng
      locked: "Nhờ quản trị viên mở khoá trong Cài đặt, mục Người dùng và phân quyền.",
      unreadable:
        "Thường là bảng app_users bật Row Level Security nhưng khoá Supabase không bỏ qua được. Thêm SUPABASE_SERVICE_ROLE_KEY (khoá service_role, không phải anon) rồi khởi động lại. Đừng tắt RLS để dùng khoá anon: bảng này giữ mật khẩu đã băm.", // copy-allow: đoạn giải thích dài, hiển thị thành khối riêng
    },
    oauth: {
      unavailable: "Chưa cấu hình Google OAuth hoặc Supabase; vui lòng đăng nhập bằng mật khẩu.",
      origin: "Tên miền này chưa được cấu hình cho Google OAuth. Liên hệ quản trị Vexim.",
      cancelled: "Đăng nhập Google bị hủy hoặc phiên đã hết hạn; vui lòng thử lại.",
      unverified: "Google chưa xác thực email hoặc không trả về danh tính hợp lệ.",
      existing: "Email này đã có tài khoản trong hệ thống. Hãy chọn Đăng nhập với Google ở đây.",
      failed: "Không hoàn tất được xác thực Google. Vui lòng thử lại.",
      invalid: "Yêu cầu đăng nhập Google không hợp lệ.",
      rate_limited: "Bạn đã thử quá nhiều lần. Vui lòng thử lại sau.",
    },
    shellCaption: "Đăng nhập để quản lý hồ sơ doanh nghiệp và yêu cầu báo giá.",
    shellPoints: [
      "Dành cho nhà cung cấp và đội ngũ Vexim.",
      "Người mua không cần đăng nhập để gửi yêu cầu báo giá.",
      "Thông tin liên hệ của người mua chỉ chia sẻ khi họ đồng ý giới thiệu.",
    ],
  },
  register: {
    metaTitle: "Tạo tài khoản | Veximtrade",
    legend: "Bạn muốn tạo loại tài khoản nào?",
    buyerTitle: "Người mua",
    buyerSummary: "Tạo tài khoản người mua miễn phí bằng email, không cần mật khẩu.",
    supplierTitle: "Nhà cung cấp",
    supplierSummary: "Bán hàng cho người mua quốc tế. Đăng ký miễn phí, xác minh trong 1 ngày làm việc.",
    continue: "Tiếp tục",
    alreadyHaveAccount: "Đã có tài khoản?",
    signIn: "Đăng nhập",
    buyerNoteLead: "Tài khoản người mua",
    buyerNote: "được tạo miễn phí bằng email, không cần mật khẩu.",
    supplierNoteLead: "Tài khoản nhà cung cấp",
    supplierNote:
      "đăng ký miễn phí và được xác minh trong 1 ngày làm việc; khi hồ sơ được duyệt, bạn đăng sản phẩm và nhận yêu cầu báo giá. Hồ sơ lưu nháp được, nộp khi đã đủ giấy tờ.", // copy-allow: đoạn giải thích dài, hiển thị thành khối riêng
    shellCaption: "Gặp đội ngũ kiểm tra nhà máy trước khi bạn đặt hàng.",
    shellPoints: [
      "Người mua: gửi yêu cầu báo giá và nhận báo giá từ nhà cung cấp Việt Nam phù hợp.",
      "Nhà cung cấp: đăng ký miễn phí, xác minh trong 1 ngày làm việc, rồi đăng sản phẩm và nhận yêu cầu báo giá.",
      "Người mua không mất phí và ký hợp đồng trực tiếp với nhà cung cấp mình chọn.",
    ],
  },
  supplierRegister: {
    metaTitle: "Tạo tài khoản nhà cung cấp",
    step: "Nhà cung cấp · Bước 1/2",
    title: "Tạo tài khoản",
    note: "Hồ sơ được xác minh trong 1 ngày làm việc. Ngay khi được duyệt, bạn đăng sản phẩm và nhận yêu cầu báo giá.",
    loginQuestion: "Đã có tài khoản?",
    login: "Đăng nhập",
    buyerQuestion: "Bạn là người mua?",
    sendQuoteRequest: "Gửi yêu cầu báo giá",
    noSignInNeeded: "không cần tài khoản, hoặc",
    changeType: "đổi loại tài khoản",
    shellCaption: "Bán hàng cho người mua quốc tế",
    shellLede: "Đăng ký miễn phí trong vài phút. Hoàn thiện hồ sơ là bạn có thể đăng sản phẩm và nhận yêu cầu báo giá.",
    shellPoints: [
      "Đăng ký nhanh bằng email hoặc Google",
      "Điền thông tin doanh nghiệp và tải giấy đăng ký kinh doanh",
      "Hồ sơ được xác minh trong 1 ngày làm việc, giúp người mua tin tưởng bạn hơn",
    ],
    oauth: {
      unavailable: "Google OAuth chưa được cấu hình trên tên miền này. Bạn có thể tạo tài khoản bằng email.",
      origin: "Tên miền này chưa được phép dùng Google OAuth. Vui lòng dùng email để đăng ký.",
      cancelled: "Đăng ký Google đã bị hủy hoặc hết hạn. Vui lòng thử lại.",
      unverified: "Google chưa xác thực email. Vui lòng xác thực rồi thử lại.",
      failed: "Không hoàn tất được đăng ký Google. Vui lòng thử lại hoặc dùng email.",
      rate_limited: "Bạn đã thử quá nhiều lần. Vui lòng thử lại sau.",
    },
    form: {
      email: "Email đăng nhập",
      password: "Mật khẩu",
      passwordHint: "8-128 ký tự, gồm cả chữ và số.",
      showPassword: "Hiện mật khẩu",
      hidePassword: "Ẩn mật khẩu",
      consent: "Tôi đồng ý tạo tài khoản để gửi hồ sơ doanh nghiệp đi duyệt.",
      submit: "Tạo tài khoản bằng email",
      submitting: "Đang tạo tài khoản…",
      goToLogin: "Đến trang đăng nhập",
      challengeMissing: "Vui lòng hoàn tất bước kiểm tra bảo mật.",
      genericError: "Không kết nối được máy chủ. Vui lòng thử lại.",
      or: "hoặc",
      google: "Tiếp tục với Google",
      googleNoteBefore:
        "Tiếp tục với Google đồng nghĩa bạn đồng ý tạo tài khoản nhà cung cấp để gửi hồ sơ doanh nghiệp. Google chỉ xác thực email; bạn vẫn phải khai hồ sơ doanh nghiệp và chờ được mở quyền. Xem", // copy-allow: đoạn giải thích dài, hiển thị thành khối riêng
      googleNotePrivacy: "Chính sách bảo mật",
      googleNoteBetween: "và",
      googleNoteTerms: "Điều khoản sử dụng",
      googleNoteAfter: ".",
    },
  },
  forgot: {
    title: "Quên mật khẩu",
    subtitle: "Nhập email tài khoản của bạn. Hệ thống gửi liên kết đặt lại mật khẩu có hiệu lực 30 phút.",
    submit: "Gửi liên kết đặt lại mật khẩu",
    challengeMissing: "Vui lòng hoàn tất bước kiểm tra bảo mật.",
    failed: "Chưa gửi được yêu cầu. Vui lòng thử lại.",
    sent: "Đã gửi hướng dẫn đặt lại mật khẩu.",
    networkError: "Không gửi được yêu cầu. Vui lòng kiểm tra kết nối và thử lại.",
    backToLogin: "Nhớ mật khẩu rồi?",
    linkToLogin: "Quay lại đăng nhập",
  },
  reset: {
    title: "Đặt lại mật khẩu",
    subtitle: "Nhập mật khẩu mới cho tài khoản",
    newPassword: "Mật khẩu mới",
    newPasswordPlaceholder: "Ít nhất 8 ký tự, gồm chữ và số",
    repeatPassword: "Nhập lại mật khẩu mới",
    submit: "Lưu mật khẩu mới",
    challengeMissing: "Vui lòng hoàn tất bước kiểm tra bảo mật.",
    failed: "Chưa đặt lại được mật khẩu. Vui lòng thử lại.",
    done: "Đã đặt lại mật khẩu thành công.",
    networkError: "Không gửi được yêu cầu. Vui lòng kiểm tra kết nối và thử lại.",
    loginNow: "Đăng nhập ngay",
    backToLogin: "Quay lại đăng nhập",
    resend: "Gửi lại yêu cầu đặt lại mật khẩu",
    expired: "Liên kết đặt lại mật khẩu đã hết hạn (quá 30 phút).",
    invalid: "Liên kết đặt lại mật khẩu không hợp lệ hoặc bị thiếu.",
  },
};

export const authMessages: Record<Locale, AuthMessages> = { en, vi };
export type { AuthMessages };
