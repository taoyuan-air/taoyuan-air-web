"""
SSL 工具：為台灣政府 API 建立寬鬆的 SSL context。

問題背景：
    openssl.cwa.gov.tw / data.moenv.gov.tw 的憑證缺少 RFC 5280 要求的
    Subject Key Identifier 欄位。OpenSSL 3.6+ 預設啟用 VERIFY_X509_STRICT，
    會拒絕此類憑證，導致 ConnectError: CERTIFICATE_VERIFY_FAILED。

解法：
    建立只關閉 VERIFY_X509_STRICT 的 SSLContext，其他驗證（信任鏈、過期、
    hostname 驗證）維持正常，不等同於 verify=False。
"""

import ssl

import certifi


def make_gov_ssl_context() -> ssl.SSLContext:
    """
    回傳一個不啟用 VERIFY_X509_STRICT 的 SSLContext。
    使用 certifi 的 CA bundle，hostname 驗證維持開啟。
    """
    ctx = ssl.create_default_context(cafile=certifi.where())
    # 移除嚴格模式：允許缺少 Subject Key Identifier 的憑證
    ctx.verify_flags &= ~ssl.VERIFY_X509_STRICT
    return ctx
