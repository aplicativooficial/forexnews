import fs from 'fs';

const serviceAccount = {
  "type": "service_account",
  "project_id": "gen-lang-client-0877834251",
  "private_key_id": "1703b55983282c0b254971bf19c3a81e3b309fa4",
  "private_key": "-----BEGIN PRIVATE KEY-----\nMIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQC/I8sDBx5akKFh\nT4MgvWRUlkzxl3W4K5VEmnf0MxKqyBDsgRQ4VWhb0PRzjA7+r4MnRL3oTrFU17FR\nf+HeR5xcjhCJUMRocevbN9JzWvWUOjAIEZpisBUv0Mhb8L8o21fwzWZ/WZaysY+3\nSJICYeTlZ6QahL/QtOpLlNnpPe9cC8UjsdW0E4ZI/04PbSsPk4jf+6UBHyZ0Ca46\nbWF2T9YhZ9xjyRnrUQ0G3gP7gZsHsJ4aFeroEKqjCSlMMjFNGJMCeuKPnYjJrc61\nU7SpwBVtV6KW8SpA8WRFZq6rqLIrG1i+jk0X8UnR83IPA5kI4U/+iIT4a+4iDK+P\nG7Pa/QlnAgMBAAECggEAB7hTX8ju0eubiQmkGzNrFPuJGgzrBUhFXCL9C1DwxRMV\nk+fWwDu63lJ/PReAF4tROcnN/c8H3IxlrgwDPG4aA6b9Rf6MIEfRpeYISv52gski\n3YCQgsHn6Sl+njAIGIdbcu9o32Xn70m6q0V0GEKJ8zYPa77G3JAiEnFtp70HqOkC\n6+nonu/63+eYTQ/L0dspp933rLQxVvtxWzgHK3Bmg8MjcmrEBA5QHXxAeyLrV/Jt\nz1Obv904xINndVpmgY/ZyvNzvwZTWWIwoxoBKQuOoE125Z7xQ1gJIOgB8I1ZeW4j\nW0Sx5ebnpxGkcbUQMEP/DqRJd6RMJan01eyC9UjeQQKBgQDdpKkrWACM9V6XWf5q\nn9v9FRybRoUdL5g8EDe8DYEuJoHhxsUT/N4DJycjunSZ3qJN0/D1cZqYTfM0tQmY\nW9uoAhjhbV+mGqXIAGbXWIcji1jwgiWCdCmqmQ+3PFpP1NeT7vM0Umi6LRgRoB3s\njHNRSuEj5SfG256LW3bQVlSsoQKBgQDcxK8OqowTvZSCCH/6ZrluSsM6mdQoGhqQ\nkMj/40muDqlRy4OkjvYqStZPoVanU6G6ZGALFK/YVH0mth7Xz0HQ6HiRYkJMUp44\nSt2O+YflCJMhlVfN4JPXXqpx6pZu1ZOssKcSt7j1+Bk5OwKBIG/+o9s0+xxT9dur\Ul2GmLGxBwKBgAefeCoDdtFiRwSRlcx4/wnvRfKZNE7Sqju2mxQeqsi5jlIDkhej\n5Mba+9+gtA3uuEpQ9cKbS6PdWnX/m/rffeiDWfO23UlLNVRxnxfc9ZjlXAO5liys\nbhpt9TpqGvkP6vItj7PG+c8daeyBQ0Y1dmnfV2ryoLGYMBW+6ZE0xujBAoGAPjDy\nF7GXsF/xnAgE9WdGyXkqMjHvgDSKUztWRC+lK/FZZX9tYEgdtKBMazZKEO0QXE+2\ndqinOMvkTal0Wts58T3r6RjDEHkdtUHx1DsbOzwFJqrJh2fCfiNe5KRvKF3mMfm5\ntx4mbrQrduHWvMWEhzlloTE0M7rI3SRg0G/nbrUCgYB+5UnEuIOIlO5iUVLxVRGr\nXXByZZkTla1SlbYQfAdToEovbVCdZ5GrlgUFEfmOtjyUf3X04k57cNR5zKWaQBvw\ntWcU5SMcP57lu/pvKGptqL5K8uGJwgvfp75Ho/VBrDOyKPPmlNMKcK7yJL5GfsM/\n/OSRuJeGjEBMMLR8feOSBA==\n-----END PRIVATE KEY-----\n",
  "client_email": "firebase-adminsdk-fbsvc@gen-lang-client-0877834251.iam.gserviceaccount.com",
  "client_id": "108761972851078011770",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-fbsvc%40gen-lang-client-0877834251.iam.gserviceaccount.com",
  "universe_domain": "googleapis.com"
};

fs.writeFileSync('firebase-service-account.json', JSON.stringify(serviceAccount, null, 2));
console.log('Successfully wrote firebase-service-account.json');
