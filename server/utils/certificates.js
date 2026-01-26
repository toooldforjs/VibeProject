import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Путь к директории с сертификатами
 */
const CERTS_DIR = path.join(__dirname, '..', 'certs');
const ROOT_CERT_PATH = path.join(CERTS_DIR, 'russian_trusted_root_ca_pem.crt');

/**
 * Создает директорию для сертификатов, если её нет
 */
function ensureCertsDir() {
  if (!fs.existsSync(CERTS_DIR)) {
    fs.mkdirSync(CERTS_DIR, { recursive: true });
    console.log(`📁 Создана директория для сертификатов: ${CERTS_DIR}`);
  }
}

/**
 * Проверяет наличие корневого сертификата Минцифры
 * @returns {boolean} true, если сертификат существует
 */
export function hasRootCertificate() {
  return fs.existsSync(ROOT_CERT_PATH);
}

/**
 * Загружает корневой сертификат Минцифры с официального источника
 * @returns {Promise<void>}
 */
export async function downloadRootCertificate() {
  ensureCertsDir();

  const certUrl = 'https://gu-st.ru/content/lending/russian_trusted_root_ca_pem.crt';
  
  console.log('📥 Загрузка корневого сертификата Минцифры...');
  
  return new Promise((resolve, reject) => {
    // При загрузке сертификата временно отключаем проверку сертификата,
    // так как сам сертификат нужен для проверки
    const downloadAgent = new https.Agent({
      rejectUnauthorized: false,
    });

    const options = {
      hostname: 'gu-st.ru',
      path: '/content/lending/russian_trusted_root_ca_pem.crt',
      method: 'GET',
      agent: downloadAgent,
    };

    const req = https.request(options, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Ошибка загрузки сертификата: ${response.statusCode}`));
        return;
      }

      let data = '';
      response.on('data', (chunk) => {
        data += chunk;
      });

      response.on('end', () => {
        try {
          // Проверяем, что загруженные данные похожи на сертификат
          if (!data.includes('BEGIN CERTIFICATE') || !data.includes('END CERTIFICATE')) {
            reject(new Error('Загруженные данные не являются валидным сертификатом'));
            return;
          }

          fs.writeFileSync(ROOT_CERT_PATH, data);
          console.log(`✅ Сертификат успешно загружен: ${ROOT_CERT_PATH}`);
          resolve();
        } catch (error) {
          reject(new Error(`Ошибка сохранения сертификата: ${error.message}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(new Error(`Ошибка при загрузке сертификата: ${error.message}`));
    });

    req.end();
  });
}

/**
 * Инициализирует сертификаты: проверяет наличие и загружает при необходимости
 * @returns {Promise<void>}
 */
export async function initializeCertificates() {
  if (!hasRootCertificate()) {
    console.log('⚠️  Корневой сертификат Минцифры не найден. Попытка загрузки...');
    try {
      await downloadRootCertificate();
    } catch (error) {
      console.error('❌ Ошибка загрузки сертификата:', error.message);
      console.log('💡 Вы можете скачать сертификат вручную с https://www.gosuslugi.ru/crt');
      console.log(`   и поместить его в: ${ROOT_CERT_PATH}`);
      throw error;
    }
  } else {
    console.log('✅ Корневой сертификат Минцифры найден');
  }
}

/**
 * Создает HTTPS агент с поддержкой сертификатов Минцифры
 * @param {Object} options - Дополнительные опции для HTTPS агента
 * @returns {https.Agent}
 */
export function createHttpsAgent(options = {}) {
  const certPath = hasRootCertificate() ? ROOT_CERT_PATH : null;

  const agentOptions = {
    rejectUnauthorized: false, // Отключаем проверку для работы с сертификатами Минцифры
    ...options,
  };

  // Если сертификат найден, добавляем его в цепочку доверенных
  if (certPath) {
    try {
      const cert = fs.readFileSync(certPath);
      agentOptions.ca = [cert];
      // Включаем проверку, если сертификат добавлен
      agentOptions.rejectUnauthorized = true;
    } catch (error) {
      console.warn('⚠️  Не удалось прочитать сертификат, используем режим без проверки:', error.message);
    }
  }

  return new https.Agent(agentOptions);
}

/**
 * Настраивает переменные окружения для работы с сертификатами
 */
export function setupEnvironmentCertificates() {
  if (hasRootCertificate()) {
    // Устанавливаем путь к дополнительным сертификатам
    process.env.NODE_EXTRA_CA_CERTS = ROOT_CERT_PATH;
    console.log(`🔐 NODE_EXTRA_CA_CERTS установлен: ${ROOT_CERT_PATH}`);
  } else {
    console.warn('⚠️  Сертификат не найден, NODE_EXTRA_CA_CERTS не установлен');
  }
}
