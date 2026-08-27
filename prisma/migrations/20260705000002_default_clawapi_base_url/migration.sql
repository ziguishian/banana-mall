UPDATE "ProviderConfig"
SET "baseUrl" = 'https://api.clawapi.me/v1'
WHERE "baseUrl" IN ('https://api.ofapp.cn/v1', 'https://api.openai-proxy.org/v1');

UPDATE "UserProviderConfig"
SET "baseUrl" = 'https://api.clawapi.me/v1'
WHERE "baseUrl" IN ('https://api.ofapp.cn/v1', 'https://api.openai-proxy.org/v1');
