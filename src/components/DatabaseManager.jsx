import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Upload, Trash2, Download, Filter, Search, X, FileSpreadsheet, AlertCircle, Phone, MapPin, Users, Building2, RefreshCw, CheckCircle2, XCircle, Loader2, Zap, Clock, Car, Route, Target, Database, Calendar, Hash, History, Layers, Tag, Settings, ArrowRight, Check, Columns } from 'lucide-react';
import * as XLSX from 'xlsx';

// ============================================
// DATABASE MANAGER (IndexedDB)
// ============================================
const DB_NAME = 'ProspectDB';
const DB_VERSION = 3;

const initDB = () => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('contacts')) {
        const store = db.createObjectStore('contacts', { keyPath: 'uniqueId' });
        store.createIndex('phone', 'phone', { unique: false });
        store.createIndex('siret', 'siret', { unique: false });
        store.createIndex('postalCode', 'postalCode', { unique: false });
      }
      if (!db.objectStoreNames.contains('exports')) {
        db.createObjectStore('exports', { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains('config')) {
        db.createObjectStore('config', { keyPath: 'key' });
      }
    };
  });
};

const dbOps = {
  async getAll(store) {
    const db = await initDB();
    return new Promise((res, rej) => {
      const req = db.transaction(store, 'readonly').objectStore(store).getAll();
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
  },
  async put(store, data) {
    const db = await initDB();
    return new Promise((res, rej) => {
      const req = db.transaction(store, 'readwrite').objectStore(store).put(data);
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
  },
  async putMany(store, items) {
    const db = await initDB();
    return new Promise((res, rej) => {
      const tx = db.transaction(store, 'readwrite');
      const s = tx.objectStore(store);
      items.forEach(item => s.put(item));
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  },
  async delete(store, key) {
    const db = await initDB();
    return new Promise((res, rej) => {
      const req = db.transaction(store, 'readwrite').objectStore(store).delete(key);
      req.onsuccess = () => res();
      req.onerror = () => rej(req.error);
    });
  },
  async clear(store) {
    const db = await initDB();
    return new Promise((res, rej) => {
      const req = db.transaction(store, 'readwrite').objectStore(store).clear();
      req.onsuccess = () => res();
      req.onerror = () => rej(req.error);
    });
  },
  async getConfig(key) {
    const db = await initDB();
    return new Promise((res, rej) => {
      const req = db.transaction('config', 'readonly').objectStore('config').get(key);
      req.onsuccess = () => res(req.result?.value);
      req.onerror = () => rej(req.error);
    });
  },
  async setConfig(key, value) {
    const db = await initDB();
    return new Promise((res, rej) => {
      const req = db.transaction('config', 'readwrite').objectStore('config').put({ key, value });
      req.onsuccess = () => res();
      req.onerror = () => rej(req.error);
    });
  }
};

// ============================================
// CONSTANTS & COLUMN DETECTION
// ============================================
const SMALL_BUSINESS_CODES = ['NN', '00', '01', '02', '03', '11'];
const EFFECTIF_LABELS = {
  'NN': '0 (non employeur)', '00': '0 salarié', '01': '1-2 sal.', '02': '3-5 sal.',
  '03': '6-9 sal.', '11': '10-19 sal.', '12': '20-49 sal.', '21': '50-99 sal.',
  '22': '100-199 sal.', '31': '200-249 sal.', '32': '250-499 sal.', '41': '500-999 sal.'
};

// Mapping des champs avec leurs synonymes possibles pour la détection automatique
const FIELD_SYNONYMS = {
  uniqueId: ['id fiche', 'id', 'uniqueid', 'unique_id', 'identifiant', 'ref', 'reference'],
  name: ['nom', 'name', 'raison sociale', 'raison_sociale', 'entreprise', 'société', 'societe', 'denomination', 'dénomination', 'nom de l\'entreprise', 'nom entreprise'],
  address: ['adresse', 'address', 'addresse', 'rue', 'voie', 'adresse postale', 'adresse_postale'],
  postalCode: ['code postal', 'code_postal', 'codepostal', 'cp', 'postal', 'zip', 'zipcode', 'code post'],
  city: ['ville', 'city', 'commune', 'localité', 'localite'],
  phone: ['téléphone', 'telephone', 'tel', 'tél', 'phone', 'tel1', 'téléphone 1', 'telephone1', 'fixe', 'tel fixe'],
  mobile: ['mobile', 'portable', 'gsm', 'tel2', 'téléphone 2', 'telephone2', 'tel mobile', 'cellulaire'],
  phone2: ['fax', 'téléphone 3', 'tel3', 'autre tel', 'autre téléphone'],
  email: ['email', 'mail', 'e-mail', 'courriel', 'adresse mail', 'adresse email'],
  website: ['site', 'site web', 'website', 'web', 'url', 'site internet'],
  category: ['catégorie', 'categorie', 'category', 'rubrique', 'secteur', 'activité', 'activite', 'type'],
  siret: ['siret', 'n° siret', 'numero siret', 'numéro siret'],
  siren: ['siren', 'n° siren', 'numero siren', 'numéro siren'],
  naf: ['naf', 'code naf', 'ape', 'code ape', 'activité principale'],
  effectifCode: ['effectif', 'effectif (code)', 'code effectif', 'tranche effectif', 'nb salariés', 'nombre salariés', 'salariés', 'employees'],
  effectifLabel: ['effectif label', 'tranche', 'effectif entreprise', 'effectif de l\'entreprise'],
  legalForm: ['forme juridique', 'forme_juridique', 'statut juridique', 'legal form'],
  capital: ['capital', 'capital social'],
  department: ['département', 'departement', 'dept', 'dpt'],
  region: ['région', 'region'],
  description: ['description', 'activité', 'activity', 'commentaire', 'notes', 'observation'],
  services: ['services', 'prestations'],
  dirigeants: ['dirigeants', 'dirigeant', 'gérant', 'gerant', 'responsable', 'contact'],
  dateCreation: ['date création', 'date de création', 'date_creation', 'création', 'creation', 'date création ent.'],
  lat: ['latitude', 'lat', 'y'],
  lon: ['longitude', 'lon', 'lng', 'long', 'x'],
  createdAt: ['date import', 'date_import', 'importé le', 'created_at', 'createdat'],
  lastExportedAt: ['dernier export', 'last_export', 'exporté le', 'lastexportedat'],
  exportCount: ['nb exports', 'exports', 'export_count', 'exportcount'],
  sourceFile: ['source', 'fichier source', 'origine', 'sourcefile']
};

// Fonction pour détecter automatiquement les colonnes
const detectColumns = (headers) => {
  const mapping = {};
  const headersLower = headers.map(h => h?.toString().toLowerCase().trim() || '');

  Object.entries(FIELD_SYNONYMS).forEach(([field, synonyms]) => {
    for (const synonym of synonyms) {
      const index = headersLower.findIndex(h => h === synonym || h.includes(synonym));
      if (index !== -1 && !Object.values(mapping).includes(headers[index])) {
        mapping[field] = headers[index];
        break;
      }
    }
  });

  return mapping;
};

// ============================================
// HELPERS
// ============================================
const normalizePhone = (phone) => {
  if (!phone) return null;
  const cleaned = String(phone).replace(/\D/g, '');
  if (cleaned.length < 9) return null;
  // Garder les 10 derniers chiffres pour la France
  return cleaned.slice(-10);
};

const normalizePostalCode = (cp) => {
  if (!cp) return null;
  // Convertir en string et nettoyer
  let code = String(cp).trim();
  // Si c'est un nombre à virgule (Excel), prendre la partie entière
  if (code.includes('.')) code = code.split('.')[0];
  // Enlever tout ce qui n'est pas un chiffre
  code = code.replace(/\D/g, '');
  // Si vide ou trop court, retourner null
  if (!code || code.length < 4) return null;
  // Ajouter le 0 devant si nécessaire (codes 01000-09999)
  if (code.length === 4) code = '0' + code;
  // Prendre seulement les 5 premiers chiffres
  return code.slice(0, 5);
};

const formatPhone = (phone) => phone?.length === 10 ? phone.replace(/(\d{2})(?=\d)/g, '$1 ').trim() : phone;
const formatDuration = (s) => !s ? '-' : s < 3600 ? `${Math.round(s / 60)} min` : `${Math.floor(s / 3600)}h${(Math.round(s / 60) % 60).toString().padStart(2, '0')}`;
const formatDistance = (m) => !m ? '-' : m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`;
const formatDate = (d) => d ? new Date(d).toLocaleDateString('fr-FR') : '-';
const formatDateTime = (d) => d ? new Date(d).toLocaleString('fr-FR') : '-';

const generateUniqueId = (prefix, counter) => `${prefix}_${counter.toString().padStart(5, '0')}`;

// ============================================
// API FUNCTIONS
// ============================================
const geocodeAddress = async (address, postalCode, city) => {
  const query = `${address || ''} ${postalCode || ''} ${city || ''}`.trim();
  if (!query) return { lat: null, lon: null, status: 'no_data' };
  try {
    const response = await fetch(`https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(query)}&limit=1`);
    const data = await response.json();
    if (data.features?.length > 0) {
      const [lon, lat] = data.features[0].geometry.coordinates;
      return { lat, lon, status: 'success' };
    }
    return { lat: null, lon: null, status: 'not_found' };
  } catch { return { lat: null, lon: null, status: 'error' }; }
};

const calculateRoute = async (startLon, startLat, endLon, endLat) => {
  try {
    const response = await fetch(
      `https://data.geopf.fr/navigation/itineraire?resource=bdtopo-osrm&profile=car&optimization=fastest&start=${startLon},${startLat}&end=${endLon},${endLat}`
    );
    const data = await response.json();
    return { distance: data.distance, duration: data.duration, status: 'success' };
  } catch { return { distance: null, duration: null, status: 'error' }; }
};

const enrichFromAPI = async (record) => {
  const searchQuery = record.siret || `${record.name} ${record.city}`.trim();
  if (!searchQuery) return { apiEnriched: true, apiStatus: 'no_data' };
  try {
    const response = await fetch(
      `https://recherche-entreprises.api.gouv.fr/search?q=${encodeURIComponent(searchQuery)}&page=1&per_page=1`
    );
    const result = await response.json();
    if (result.results?.length > 0) {
      const c = result.results[0];
      return {
        apiEnriched: true, apiStatus: 'success',
        siren: c.siren,
        siret: c.siege?.siret || record.siret,
        apiEffectifCode: c.tranche_effectif_salarie,
        apiEffectifLabel: EFFECTIF_LABELS[c.tranche_effectif_salarie],
        apiNaf: c.activite_principale,
        apiDateCreation: c.date_creation,
        apiDirigeants: c.dirigeants?.map(d => `${d.prenoms} ${d.nom}`).join(', '),
        lat: c.siege?.latitude ? parseFloat(c.siege.latitude) : record.lat,
        lon: c.siege?.longitude ? parseFloat(c.siege.longitude) : record.lon,
        geoStatus: c.siege?.latitude ? 'success' : record.geoStatus
      };
    }
    return { apiEnriched: true, apiStatus: 'not_found' };
  } catch { return { apiEnriched: true, apiStatus: 'error' }; }
};

// ============================================
// COLUMN MAPPING MODAL
// ============================================
const ColumnMappingModal = ({ headers, initialMapping, onConfirm, onCancel, sampleData }) => {
  const [mapping, setMapping] = useState(initialMapping);

  const fields = [
    { key: 'uniqueId', label: 'ID Fiche', required: false, description: 'Identifiant unique existant' },
    { key: 'name', label: 'Nom / Entreprise', required: true },
    { key: 'address', label: 'Adresse', required: false },
    { key: 'postalCode', label: 'Code Postal', required: true },
    { key: 'city', label: 'Ville', required: false },
    { key: 'phone', label: 'Téléphone', required: false },
    { key: 'mobile', label: 'Mobile', required: false },
    { key: 'email', label: 'Email', required: false },
    { key: 'category', label: 'Catégorie/Rubrique', required: false },
    { key: 'siret', label: 'SIRET', required: false },
    { key: 'siren', label: 'SIREN', required: false },
    { key: 'naf', label: 'Code NAF', required: false },
    { key: 'effectifCode', label: 'Effectif (code)', required: false, description: 'Code INSEE: NN, 00, 01...' },
    { key: 'effectifLabel', label: 'Effectif (libellé)', required: false },
    { key: 'dirigeants', label: 'Dirigeants', required: false },
    { key: 'dateCreation', label: 'Date création entreprise', required: false },
    { key: 'description', label: 'Description', required: false },
    { key: 'lat', label: 'Latitude', required: false },
    { key: 'lon', label: 'Longitude', required: false },
  ];

  const getSampleValue = (header) => {
    if (!header || !sampleData.length) return '';
    const val = sampleData[0][header];
    if (val === undefined || val === null) return '';
    return String(val).slice(0, 50);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b p-4 flex items-center gap-3">
          <Columns className="w-6 h-6 text-blue-600" />
          <h2 className="text-xl font-bold text-gray-800">Configuration des colonnes</h2>
        </div>

        <div className="p-4">
          <p className="text-sm text-gray-600 mb-4">
            Associez chaque champ à la colonne correspondante dans votre fichier.
            Les colonnes détectées automatiquement sont pré-remplies.
          </p>

          <div className="grid gap-3">
            {fields.map(field => (
              <div key={field.key} className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50">
                <div className="w-48 flex-shrink-0">
                  <div className="font-medium text-sm text-gray-700">
                    {field.label}
                    {field.required && <span className="text-red-500 ml-1">*</span>}
                  </div>
                  {field.description && (
                    <div className="text-xs text-gray-400">{field.description}</div>
                  )}
                </div>
                <ArrowRight className="w-4 h-4 text-gray-400" />
                <select
                  value={mapping[field.key] || ''}
                  onChange={(e) => setMapping(m => ({ ...m, [field.key]: e.target.value || null }))}
                  className={`flex-1 border rounded-lg px-3 py-2 text-sm ${mapping[field.key] ? 'border-green-300 bg-green-50' : ''
                    }`}
                >
                  <option value="">-- Non mappé --</option>
                  {headers.map(h => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
                {mapping[field.key] && (
                  <div className="w-40 text-xs text-gray-500 truncate bg-gray-100 px-2 py-1 rounded">
                    Ex: {getSampleValue(mapping[field.key]) || '(vide)'}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="sticky bottom-0 bg-white border-t p-4 flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
          >
            Annuler
          </button>
          <button
            onClick={() => onConfirm(mapping)}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center justify-center gap-2"
          >
            <Check className="w-4 h-4" />
            Confirmer le mapping
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================
// MAIN COMPONENT
// ============================================
export default function DatabaseManager() {
  const [data, setData] = useState([]);
  const [exports, setExports] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [idCounter, setIdCounter] = useState(1);
  const [idPrefix, setIdPrefix] = useState('Vd_S');

  const [filters, setFilters] = useState({
    postalCode: '', city: '', category: '', search: '',
    onlySmallBusiness: false, maxDuration: 0,
    exportDate: '', onlyNew: false, onlyExported: false
  });
  const [showDuplicates, setShowDuplicates] = useState(false);
  const [sortBy, setSortBy] = useState('createdAt');

  const [startPoint, setStartPoint] = useState({ address: '', lat: null, lon: null, status: null });
  const [startInput, setStartInput] = useState('');

  const [processing, setProcessing] = useState({ type: null, current: 0, total: 0 });

  // Import states
  const [pendingImport, setPendingImport] = useState(null); // { rawData, headers, fileName }
  const [showMappingModal, setShowMappingModal] = useState(false);
  const [importPreview, setImportPreview] = useState({ show: false, data: [], duplicates: [], newRecords: [], hasExistingIds: false });

  // Load from DB
  useEffect(() => {
    const load = async () => {
      try {
        const [contacts, exportHistory, counter, prefix, savedStart] = await Promise.all([
          dbOps.getAll('contacts'),
          dbOps.getAll('exports'),
          dbOps.getConfig('idCounter'),
          dbOps.getConfig('idPrefix'),
          dbOps.getConfig('startPoint')
        ]);
        setData(contacts || []);
        setExports(exportHistory || []);
        if (counter) setIdCounter(counter);
        if (prefix) setIdPrefix(prefix);
        if (savedStart) { setStartPoint(savedStart); setStartInput(savedStart.address || ''); }
      } catch (e) { console.error('Load error:', e); }
      setIsLoading(false);
    };
    load();
  }, []);

  const saveData = useCallback(async (newData) => {
    try { await dbOps.putMany('contacts', newData); } catch (e) { console.error('Save error:', e); }
  }, []);

  const updateIdCounter = useCallback(async (c) => {
    setIdCounter(c);
    await dbOps.setConfig('idCounter', c);
  }, []);

  // Create record from row with mapping
  const createRecord = useCallback((row, mapping, sourceFile, counter, keepExistingId = false) => {
    const get = (key) => {
      const col = mapping[key];
      if (!col) return null;
      const val = row[col];
      return val !== undefined && val !== null && val !== '' ? val : null;
    };

    // Si la fiche a déjà un ID et qu'on veut le garder
    const existingId = get('uniqueId');
    const uniqueId = (keepExistingId && existingId) ? String(existingId) : generateUniqueId(idPrefix, counter);

    // Récupérer le code postal correctement
    const rawPostalCode = get('postalCode');
    const postalCode = normalizePostalCode(rawPostalCode);

    // Récupérer l'effectif (peut être un code ou un libellé)
    let effectifCode = get('effectifCode');
    let effectifLabel = get('effectifLabel');

    // Si on a un libellé mais pas de code, essayer de déduire le code
    if (!effectifCode && effectifLabel) {
      const labelLower = String(effectifLabel).toLowerCase();
      if (labelLower.includes('1') && labelLower.includes('2') && !labelLower.includes('10')) effectifCode = '01';
      else if (labelLower.includes('3') && labelLower.includes('5')) effectifCode = '02';
      else if (labelLower.includes('6') && labelLower.includes('9')) effectifCode = '03';
      else if (labelLower.includes('10') && labelLower.includes('19')) effectifCode = '11';
      else if (labelLower.includes('20') && labelLower.includes('49')) effectifCode = '12';
      else if (labelLower.includes('50') && labelLower.includes('99')) effectifCode = '21';
    }

    // Si on a un code, s'assurer qu'il est au bon format
    if (effectifCode) {
      effectifCode = String(effectifCode).trim().toUpperCase();
      if (!effectifLabel) effectifLabel = EFFECTIF_LABELS[effectifCode];
    }

    return {
      uniqueId,
      name: get('name'),
      address: get('address'),
      postalCode,
      city: get('city'),
      phone: normalizePhone(get('phone')),
      mobile: normalizePhone(get('mobile')),
      phone2: normalizePhone(get('phone2')),
      email: get('email'),
      website: get('website'),
      category: get('category'),
      siret: get('siret') ? String(get('siret')).replace(/\D/g, '') : null,
      siren: get('siren') ? String(get('siren')).replace(/\D/g, '') : null,
      naf: get('naf'),
      description: get('description'),
      services: get('services'),
      sourceFile,
      createdAt: get('createdAt') || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastExportedAt: get('lastExportedAt') || null,
      exportCount: parseInt(get('exportCount')) || 0,
      // Enrichissement - garder les données existantes ou initialiser
      apiEnriched: !!(effectifCode || get('lat')),
      apiStatus: (effectifCode || get('lat')) ? 'imported' : null,
      apiEffectifCode: effectifCode || null,
      apiEffectifLabel: effectifLabel || null,
      apiNaf: get('naf'),
      apiDateCreation: get('dateCreation'),
      apiDirigeants: get('dirigeants'),
      lat: get('lat') ? parseFloat(get('lat')) : null,
      lon: get('lon') ? parseFloat(get('lon')) : null,
      geoStatus: get('lat') ? 'imported' : null,
      distanceMeters: null,
      durationSeconds: null,
      routeStatus: null
    };
  }, [idPrefix]);

  // Detect duplicates
  const findDuplicates = useCallback((newRecords) => {
    const existingPhones = new Set();
    const existingSirets = new Set();
    const existingIds = new Set();

    data.forEach(r => {
      if (r.phone) existingPhones.add(r.phone);
      if (r.mobile) existingPhones.add(r.mobile);
      if (r.siret) existingSirets.add(r.siret);
      if (r.uniqueId) existingIds.add(r.uniqueId);
    });

    const duplicates = [];
    const unique = [];

    newRecords.forEach(record => {
      const isDuplicateById = existingIds.has(record.uniqueId);
      const isDuplicateByPhone =
        (record.phone && existingPhones.has(record.phone)) ||
        (record.mobile && existingPhones.has(record.mobile));
      const isDuplicateBySiret = record.siret && existingSirets.has(record.siret);

      if (isDuplicateById || isDuplicateByPhone || isDuplicateBySiret) {
        duplicates.push({ ...record, duplicateReason: isDuplicateById ? 'ID' : (isDuplicateBySiret ? 'SIRET' : 'Téléphone') });
      } else {
        unique.push(record);
        if (record.phone) existingPhones.add(record.phone);
        if (record.mobile) existingPhones.add(record.mobile);
        if (record.siret) existingSirets.add(record.siret);
        existingIds.add(record.uniqueId);
      }
    });

    return { duplicates, unique };
  }, [data]);

  // Handle file upload - step 1: read file
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const wb = XLSX.read(evt.target.result, { type: 'binary' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rawData = XLSX.utils.sheet_to_json(ws, { defval: null });

      if (!rawData.length) {
        alert('Fichier vide ou format non reconnu');
        return;
      }

      const headers = Object.keys(rawData[0]);
      const autoMapping = detectColumns(headers);

      setPendingImport({ rawData, headers, fileName: file.name, autoMapping });
      setShowMappingModal(true);
    };
    reader.readAsBinaryString(file);
    e.target.value = '';
  };

  // Handle mapping confirmation
  const handleMappingConfirm = (mapping) => {
    setShowMappingModal(false);

    const { rawData, fileName } = pendingImport;
    let currentCounter = idCounter;

    // Vérifier si le fichier contient des IDs existants
    const hasExistingIds = mapping.uniqueId && rawData.some(row => row[mapping.uniqueId]);

    const records = rawData.map(row => {
      const record = createRecord(row, mapping, fileName, currentCounter, hasExistingIds);
      if (!hasExistingIds || !row[mapping.uniqueId]) {
        currentCounter++;
      }
      return record;
    }).filter(r => r.name || r.phone || r.siret); // Filtrer les lignes vides

    const { duplicates, unique } = findDuplicates(records);

    setImportPreview({
      show: true,
      data: records,
      duplicates,
      newRecords: unique,
      hasExistingIds,
      nextCounter: currentCounter
    });

    setPendingImport(null);
  };

  // Confirm import
  const confirmImport = async (mode = 'new') => {
    let recordsToAdd;

    if (mode === 'new') {
      recordsToAdd = importPreview.newRecords;
    } else if (mode === 'all') {
      recordsToAdd = importPreview.data;
    } else if (mode === 'update') {
      // Mode mise à jour : remplacer les doublons et ajouter les nouveaux
      const existingMap = new Map(data.map(r => [r.uniqueId, r]));
      importPreview.data.forEach(r => {
        existingMap.set(r.uniqueId, { ...existingMap.get(r.uniqueId), ...r, updatedAt: new Date().toISOString() });
      });
      const newData = Array.from(existingMap.values());
      setData(newData);
      await saveData(newData);
      await updateIdCounter(importPreview.nextCounter);
      setImportPreview({ show: false, data: [], duplicates: [], newRecords: [], hasExistingIds: false });
      return;
    }

    const newData = [...data, ...recordsToAdd];
    setData(newData);
    await saveData(newData);
    await updateIdCounter(importPreview.nextCounter);
    setImportPreview({ show: false, data: [], duplicates: [], newRecords: [], hasExistingIds: false });
  };

  // Starting point
  const setStartingPoint = async () => {
    if (!startInput.trim()) return;
    setStartPoint({ ...startPoint, status: 'loading' });
    const geo = await geocodeAddress(startInput, '', '');
    const newStart = { address: startInput, lat: geo.lat, lon: geo.lon, status: geo.status };
    setStartPoint(newStart);
    await dbOps.setConfig('startPoint', newStart);
  };

  // Processing
  const enrichAll = async () => {
    const toProcess = data.filter(r => !r.apiEnriched || r.apiStatus === 'error');
    if (!toProcess.length) return;

    setProcessing({ type: 'enrich', current: 0, total: toProcess.length });
    const newData = [...data];

    for (let i = 0; i < toProcess.length; i++) {
      const record = toProcess[i];
      const idx = newData.findIndex(r => r.uniqueId === record.uniqueId);
      const enriched = await enrichFromAPI(record);
      newData[idx] = { ...newData[idx], ...enriched, updatedAt: new Date().toISOString() };
      setProcessing(p => ({ ...p, current: i + 1 }));
      setData([...newData]);
      await new Promise(r => setTimeout(r, 150));
    }
    await saveData(newData);
    setProcessing({ type: null, current: 0, total: 0 });
  };

  const geocodeAll = async () => {
    const toProcess = data.filter(r => !r.lat && (r.address || r.postalCode));
    if (!toProcess.length) return;

    setProcessing({ type: 'geocode', current: 0, total: toProcess.length });
    const newData = [...data];

    for (let i = 0; i < toProcess.length; i++) {
      const record = toProcess[i];
      const idx = newData.findIndex(r => r.uniqueId === record.uniqueId);
      const geo = await geocodeAddress(record.address, record.postalCode, record.city);
      newData[idx] = { ...newData[idx], lat: geo.lat, lon: geo.lon, geoStatus: geo.status, updatedAt: new Date().toISOString() };
      setProcessing(p => ({ ...p, current: i + 1 }));
      setData([...newData]);
      await new Promise(r => setTimeout(r, 100));
    }
    await saveData(newData);
    setProcessing({ type: null, current: 0, total: 0 });
  };

  const calculateRoutes = async () => {
    if (!startPoint.lat || !startPoint.lon) return;
    const toProcess = data.filter(r => r.lat && r.lon && !r.durationSeconds);
    if (!toProcess.length) return;

    setProcessing({ type: 'routes', current: 0, total: toProcess.length });
    const newData = [...data];

    for (let i = 0; i < toProcess.length; i++) {
      const record = toProcess[i];
      const idx = newData.findIndex(r => r.uniqueId === record.uniqueId);
      const route = await calculateRoute(startPoint.lon, startPoint.lat, record.lon, record.lat);
      newData[idx] = { ...newData[idx], distanceMeters: route.distance, durationSeconds: route.duration, routeStatus: route.status, updatedAt: new Date().toISOString() };
      setProcessing(p => ({ ...p, current: i + 1 }));
      setData([...newData]);
      await new Promise(r => setTimeout(r, 200));
    }
    await saveData(newData);
    setProcessing({ type: null, current: 0, total: 0 });
  };

  const processAll = async () => {
    await enrichAll();
    await geocodeAll();
    if (startPoint.lat) await calculateRoutes();
  };

  // Duplicates
  const duplicateIds = useMemo(() => {
    const phoneMap = new Map();
    data.forEach(r => {
      [r.phone, r.mobile, r.phone2].filter(Boolean).forEach(p => {
        if (!phoneMap.has(p)) phoneMap.set(p, []);
        phoneMap.get(p).push(r.uniqueId);
      });
    });
    const ids = new Set();
    [...phoneMap].filter(([_, v]) => v.length > 1).forEach(([_, g]) => g.forEach(id => ids.add(id)));
    return ids;
  }, [data]);

  // Filtered data
  const filteredData = useMemo(() => {
    let result = data;

    if (filters.postalCode) result = result.filter(r => r.postalCode?.startsWith(filters.postalCode));
    if (filters.city) result = result.filter(r => r.city?.toLowerCase().includes(filters.city.toLowerCase()));
    if (filters.category) result = result.filter(r => r.category?.toLowerCase().includes(filters.category.toLowerCase()));
    if (filters.search) {
      const s = filters.search.toLowerCase();
      result = result.filter(r => r.name?.toLowerCase().includes(s) || r.siret?.includes(s) || r.uniqueId?.toLowerCase().includes(s));
    }
    if (showDuplicates) result = result.filter(r => duplicateIds.has(r.uniqueId));
    if (filters.onlySmallBusiness) result = result.filter(r => SMALL_BUSINESS_CODES.includes(r.apiEffectifCode));
    if (filters.maxDuration > 0) result = result.filter(r => r.durationSeconds && r.durationSeconds <= filters.maxDuration * 60);
    if (filters.onlyNew) result = result.filter(r => !r.lastExportedAt);
    if (filters.onlyExported) result = result.filter(r => r.lastExportedAt);
    if (filters.exportDate) {
      const exp = exports.find(e => e.id === parseInt(filters.exportDate));
      if (exp) result = result.filter(r => exp.contactIds.includes(r.uniqueId));
    }

    const sortFns = {
      duration: (a, b) => (a.durationSeconds || 999999) - (b.durationSeconds || 999999),
      distance: (a, b) => (a.distanceMeters || 999999) - (b.distanceMeters || 999999),
      postalCode: (a, b) => (a.postalCode || '').localeCompare(b.postalCode || ''),
      name: (a, b) => (a.name || '').localeCompare(b.name || ''),
      createdAt: (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
      uniqueId: (a, b) => a.uniqueId.localeCompare(b.uniqueId)
    };
    if (sortFns[sortBy]) result = [...result].sort(sortFns[sortBy]);

    return result;
  }, [data, filters, showDuplicates, duplicateIds, sortBy, exports]);

  // Stats
  const stats = useMemo(() => ({
    total: data.length,
    enriched: data.filter(r => r.apiEnriched).length,
    smallBusiness: data.filter(r => SMALL_BUSINESS_CODES.includes(r.apiEffectifCode)).length,
    geocoded: data.filter(r => r.lat).length,
    withRoutes: data.filter(r => r.durationSeconds).length,
    under30min: data.filter(r => r.durationSeconds && r.durationSeconds <= 1800).length,
    neverExported: data.filter(r => !r.lastExportedAt).length
  }), [data]);

  const postalCodes = useMemo(() => [...new Set(data.map(r => r.postalCode).filter(Boolean))].sort(), [data]);
  const categories = useMemo(() => [...new Set(data.map(r => r.category).filter(Boolean))].sort(), [data]);

  // Actions
  const removeDuplicates = async () => {
    const seen = new Set();
    const toRemove = [];
    const newData = data.filter(r => {
      const phones = [r.phone, r.mobile, r.phone2].filter(Boolean);
      if (phones.some(p => seen.has(p))) { toRemove.push(r.uniqueId); return false; }
      phones.forEach(p => seen.add(p));
      return true;
    });
    setData(newData);
    await saveData(newData);
    for (const id of toRemove) await dbOps.delete('contacts', id);
  };

  const exportData = async () => {
    const now = new Date();
    const exportRecord = { date: now.toISOString(), count: filteredData.length, contactIds: filteredData.map(r => r.uniqueId) };
    const exportId = await dbOps.put('exports', exportRecord);
    setExports([...exports, { ...exportRecord, id: exportId }]);

    const newData = data.map(r => filteredData.find(f => f.uniqueId === r.uniqueId)
      ? { ...r, lastExportedAt: now.toISOString(), exportCount: (r.exportCount || 0) + 1 } : r);
    setData(newData);
    await saveData(newData);

    const rows = filteredData.map(r => ({
      'ID Fiche': r.uniqueId, 'Nom': r.name, 'Adresse': r.address, 'Code Postal': r.postalCode, 'Ville': r.city,
      'Téléphone': formatPhone(r.phone), 'Mobile': formatPhone(r.mobile), 'Email': r.email, 'Catégorie': r.category,
      'SIRET': r.siret, 'SIREN': r.siren, 'Code NAF': r.apiNaf || r.naf,
      'Effectif (code)': r.apiEffectifCode, 'Effectif': r.apiEffectifLabel, 'Dirigeants': r.apiDirigeants,
      'Date Création Ent.': r.apiDateCreation, 'Distance (km)': r.distanceMeters ? (r.distanceMeters / 1000).toFixed(1) : '',
      'Temps trajet (min)': r.durationSeconds ? Math.round(r.durationSeconds / 60) : '',
      'Latitude': r.lat, 'Longitude': r.lon, 'Date Import': formatDateTime(r.createdAt),
      'Dernier Export': formatDateTime(r.lastExportedAt), 'Nb Exports': r.exportCount, 'Source': r.sourceFile
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Export');
    XLSX.writeFile(wb, `export_${now.toISOString().slice(0, 10)}_${filteredData.length}fiches.xlsx`);
  };

  const deleteRecord = async (id) => {
    setData(data.filter(r => r.uniqueId !== id));
    await dbOps.delete('contacts', id);
  };

  const clearAllData = async () => {
    if (!window.confirm('Supprimer TOUTES les données ?')) return;
    setData([]); setExports([]);
    await dbOps.clear('contacts'); await dbOps.clear('exports');
    await updateIdCounter(1);
  };

  const changePrefix = async () => {
    const p = prompt('Nouveau préfixe:', idPrefix);
    if (p?.trim()) { setIdPrefix(p.trim()); await dbOps.setConfig('idPrefix', p.trim()); }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="w-12 h-12 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-3 md:p-6">
      <div className="max-w-7xl mx-auto space-y-4">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-700 rounded-xl shadow-lg p-5 text-white">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h1 className="text-xl md:text-2xl font-bold flex items-center gap-3">
                <Database className="w-7 h-7" /> Gestionnaire Commercial Pro
              </h1>
              <p className="text-blue-100 mt-1 text-sm">Import intelligent • Mapping colonnes • Base persistante</p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={changePrefix} className="px-3 py-1 bg-white/20 rounded-lg text-sm flex items-center gap-1">
                <Tag className="w-4 h-4" /> {idPrefix}
              </button>
              <span className="px-3 py-1 bg-white/20 rounded-lg text-sm font-mono">
                #{idCounter}
              </span>
            </div>
          </div>
        </div>

        {/* Column Mapping Modal */}
        {showMappingModal && pendingImport && (
          <ColumnMappingModal
            headers={pendingImport.headers}
            initialMapping={pendingImport.autoMapping}
            sampleData={pendingImport.rawData.slice(0, 3)}
            onConfirm={handleMappingConfirm}
            onCancel={() => { setShowMappingModal(false); setPendingImport(null); }}
          />
        )}

        {/* Import Preview Modal */}
        {importPreview.show && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6">
              <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                <Layers className="w-6 h-6 text-blue-600" /> Prévisualisation
              </h2>

              <div className="space-y-3 mb-6">
                <div className="flex justify-between p-3 bg-gray-50 rounded-lg">
                  <span>Total analysé</span>
                  <span className="font-bold">{importPreview.data.length}</span>
                </div>
                <div className="flex justify-between p-3 bg-green-50 rounded-lg text-green-700">
                  <span>✓ Nouveaux contacts</span>
                  <span className="font-bold">{importPreview.newRecords.length}</span>
                </div>
                <div className="flex justify-between p-3 bg-orange-50 rounded-lg text-orange-700">
                  <span>⚠ Doublons</span>
                  <span className="font-bold">{importPreview.duplicates.length}</span>
                </div>
                {importPreview.hasExistingIds && (
                  <div className="p-3 bg-blue-50 rounded-lg text-blue-700 text-sm">
                    ℹ️ Fichier avec IDs existants détecté (base enrichie)
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <button onClick={() => confirmImport('new')} className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">
                  Importer nouveaux ({importPreview.newRecords.length})
                </button>
                {importPreview.hasExistingIds && (
                  <button onClick={() => confirmImport('update')} className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                    Mettre à jour + Ajouter nouveaux
                  </button>
                )}
                <button onClick={() => confirmImport('all')} className="w-full px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600">
                  Tout importer ({importPreview.data.length})
                </button>
                <button onClick={() => setImportPreview({ show: false, data: [], duplicates: [], newRecords: [], hasExistingIds: false })}
                  className="w-full px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300">
                  Annuler
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Starting Point */}
        <div className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-xl shadow-sm p-4 border border-amber-200">
          <div className="flex flex-wrap items-center gap-3">
            <Target className="w-5 h-5 text-amber-600" />
            <span className="font-semibold text-amber-800">Point de départ</span>
            <input type="text" value={startInput} onChange={(e) => setStartInput(e.target.value)}
              placeholder="Ex: 15 rue de la Paix 35000 Rennes"
              className="flex-1 min-w-[250px] border border-amber-300 rounded-lg px-3 py-2 text-sm"
              onKeyDown={(e) => e.key === 'Enter' && setStartingPoint()} />
            <button onClick={setStartingPoint} className="px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 flex items-center gap-2 text-sm">
              <MapPin className="w-4 h-4" /> Définir
            </button>
            {startPoint.status === 'success' && <CheckCircle2 className="w-5 h-5 text-green-500" />}
            {startPoint.status === 'loading' && <Loader2 className="w-5 h-5 animate-spin text-amber-600" />}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 md:grid-cols-8 gap-2">
          <label className="bg-white rounded-xl shadow-sm p-3 border-2 border-dashed border-blue-200 hover:border-blue-400 cursor-pointer flex flex-col items-center justify-center">
            <Upload className="w-5 h-5 text-blue-500" />
            <span className="text-xs text-gray-600">Import</span>
            <input type="file" accept=".xls,.xlsx,.csv" onChange={handleFileUpload} className="hidden" />
          </label>

          {[
            { v: stats.total, l: 'Total', c: 'blue' },
            { v: stats.enriched, l: 'Enrichis', c: 'green' },
            { v: stats.smallBusiness, l: '<20 sal.', c: 'purple' },
            { v: stats.under30min, l: '<30 min', c: 'amber' },
            { v: stats.neverExported, l: 'Nouveaux', c: 'emerald' },
            { v: filteredData.length, l: 'Filtrés', c: 'indigo' },
            { v: exports.length, l: 'Exports', c: 'pink' }
          ].map((s, i) => (
            <div key={i} className="bg-white rounded-xl shadow-sm p-2 text-center">
              <div className={`text-lg font-bold text-${s.c}-600`}>{s.v}</div>
              <div className="text-xs text-gray-500">{s.l}</div>
            </div>
          ))}
        </div>

        {/* Processing */}
        <div className="bg-gradient-to-r from-emerald-50 to-teal-50 rounded-xl shadow-sm p-4 border border-emerald-200">
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={processAll} disabled={processing.type || !data.length}
              className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-2 text-sm font-medium">
              {processing.type ? <><Loader2 className="w-4 h-4 animate-spin" />{processing.current}/{processing.total}</> : <><Zap className="w-4 h-4" />Tout traiter</>}
            </button>
            <button onClick={enrichAll} disabled={processing.type} className="px-3 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 disabled:opacity-50 flex items-center gap-1 text-sm">
              <Building2 className="w-4 h-4" />Enrichir
            </button>
            <button onClick={geocodeAll} disabled={processing.type} className="px-3 py-2 bg-indigo-100 text-indigo-700 rounded-lg hover:bg-indigo-200 disabled:opacity-50 flex items-center gap-1 text-sm">
              <MapPin className="w-4 h-4" />Géocoder
            </button>
            <button onClick={calculateRoutes} disabled={processing.type || !startPoint.lat} className="px-3 py-2 bg-amber-100 text-amber-700 rounded-lg hover:bg-amber-200 disabled:opacity-50 flex items-center gap-1 text-sm">
              <Route className="w-4 h-4" />Trajets
            </button>
            {processing.type && (
              <div className="flex-1 min-w-[150px]">
                <div className="h-2 bg-emerald-200 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500 transition-all" style={{ width: `${(processing.current / processing.total) * 100}%` }} />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl shadow-sm p-4">
          <div className="grid grid-cols-2 md:grid-cols-5 lg:grid-cols-10 gap-2">
            <div>
              <label className="text-xs text-gray-500 block mb-1">Code Postal</label>
              <select value={filters.postalCode} onChange={(e) => setFilters(f => ({ ...f, postalCode: e.target.value }))} className="w-full border rounded-lg px-2 py-1.5 text-sm">
                <option value="">Tous</option>
                {postalCodes.map(cp => <option key={cp} value={cp}>{cp}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Catégorie</label>
              <select value={filters.category} onChange={(e) => setFilters(f => ({ ...f, category: e.target.value }))} className="w-full border rounded-lg px-2 py-1.5 text-sm">
                <option value="">Toutes</option>
                {categories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Temps max</label>
              <select value={filters.maxDuration} onChange={(e) => setFilters(f => ({ ...f, maxDuration: parseInt(e.target.value) }))} className="w-full border rounded-lg px-2 py-1.5 text-sm">
                <option value={0}>Tous</option>
                <option value={15}>≤15min</option>
                <option value={30}>≤30min</option>
                <option value={45}>≤45min</option>
                <option value={60}>≤1h</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Export</label>
              <select value={filters.exportDate} onChange={(e) => setFilters(f => ({ ...f, exportDate: e.target.value }))} className="w-full border rounded-lg px-2 py-1.5 text-sm">
                <option value="">Tous</option>
                {exports.slice(-10).reverse().map(e => <option key={e.id} value={e.id}>{formatDate(e.date)} ({e.count})</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Trier</label>
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="w-full border rounded-lg px-2 py-1.5 text-sm">
                <option value="createdAt">Date</option>
                <option value="uniqueId">ID</option>
                <option value="name">Nom</option>
                <option value="duration">Trajet</option>
                <option value="postalCode">CP</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Recherche</label>
              <input type="text" value={filters.search} onChange={(e) => setFilters(f => ({ ...f, search: e.target.value }))}
                placeholder="ID, Nom..." className="w-full border rounded-lg px-2 py-1.5 text-sm" />
            </div>
            <button onClick={() => setFilters(f => ({ ...f, onlySmallBusiness: !f.onlySmallBusiness }))}
              className={`rounded-lg text-sm font-medium mt-5 flex items-center justify-center gap-1 ${filters.onlySmallBusiness ? 'bg-purple-600 text-white' : 'bg-purple-50 text-purple-700'}`}>
              <Users className="w-4 h-4" />&lt;20
            </button>
            <button onClick={() => setFilters(f => ({ ...f, onlyNew: !f.onlyNew, onlyExported: false }))}
              className={`rounded-lg text-sm mt-5 flex items-center justify-center gap-1 ${filters.onlyNew ? 'bg-emerald-600 text-white' : 'bg-emerald-50 text-emerald-700'}`}>
              <Hash className="w-4 h-4" />New
            </button>
            <button onClick={() => setFilters(f => ({ ...f, onlyExported: !f.onlyExported, onlyNew: false }))}
              className={`rounded-lg text-sm mt-5 flex items-center justify-center gap-1 ${filters.onlyExported ? 'bg-indigo-600 text-white' : 'bg-indigo-50 text-indigo-700'}`}>
              <History className="w-4 h-4" />Exp.
            </button>
            <button onClick={() => setShowDuplicates(!showDuplicates)}
              className={`rounded-lg text-sm mt-5 flex items-center justify-center gap-1 ${showDuplicates ? 'bg-orange-500 text-white' : 'bg-orange-50 text-orange-600'}`}>
              <AlertCircle className="w-4 h-4" />{duplicateIds.size}
            </button>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-2">
          <button onClick={removeDuplicates} disabled={!duplicateIds.size}
            className="px-3 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-50 flex items-center gap-2 text-sm">
            <Trash2 className="w-4 h-4" />Suppr. doublons
          </button>
          <button onClick={exportData} disabled={!filteredData.length}
            className="px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center gap-2 text-sm">
            <Download className="w-4 h-4" />Exporter ({filteredData.length})
          </button>
          <button onClick={clearAllData} className="px-3 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 text-sm">
            Vider base
          </button>
        </div>

        {/* Table */}
        {filteredData.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-2 py-2 text-left text-xs font-medium text-gray-500">ID</th>
                    <th className="px-2 py-2 text-left text-xs font-medium text-gray-500">Nom</th>
                    <th className="px-2 py-2 text-left text-xs font-medium text-gray-500">Adresse</th>
                    <th className="px-2 py-2 text-left text-xs font-medium text-gray-500">Tél.</th>
                    <th className="px-2 py-2 text-left text-xs font-medium text-gray-500">Effectif</th>
                    <th className="px-2 py-2 text-center text-xs font-medium text-gray-500">Trajet</th>
                    <th className="px-2 py-2 text-center text-xs font-medium text-gray-500">Export</th>
                    <th className="px-2 py-2 w-8"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredData.slice(0, 100).map((r) => {
                    const isSmall = SMALL_BUSINESS_CODES.includes(r.apiEffectifCode);
                    const isClose = r.durationSeconds && r.durationSeconds <= 1800;
                    return (
                      <tr key={r.uniqueId} className={`${duplicateIds.has(r.uniqueId) ? 'bg-orange-50' : ''} ${isSmall && isClose ? 'bg-green-50' : isSmall ? 'bg-purple-50' : ''}`}>
                        <td className="px-2 py-2">
                          <div className="font-mono text-xs text-blue-600 font-medium">{r.uniqueId}</div>
                          <div className="text-xs text-gray-400">{formatDate(r.createdAt)}</div>
                        </td>
                        <td className="px-2 py-2">
                          <div className="font-medium text-gray-800 truncate max-w-[150px]">{r.name}</div>
                          <span className="text-xs text-gray-400">{r.category}</span>
                        </td>
                        <td className="px-2 py-2">
                          <div className="text-xs text-gray-600 truncate max-w-[150px]">{r.address}</div>
                          <div className="font-mono text-xs text-blue-600">{r.postalCode} {r.city}</div>
                        </td>
                        <td className="px-2 py-2">
                          {r.phone && <div className="font-mono text-xs">{formatPhone(r.phone)}</div>}
                          {r.mobile && <div className="font-mono text-xs text-green-600">{formatPhone(r.mobile)}</div>}
                        </td>
                        <td className="px-2 py-2">
                          {r.apiEffectifCode ? (
                            <span className={`px-1.5 py-0.5 rounded text-xs ${isSmall ? 'bg-purple-200 text-purple-800 font-medium' : 'bg-gray-100'}`}>
                              {r.apiEffectifLabel || r.apiEffectifCode}
                            </span>
                          ) : <span className="text-gray-300">-</span>}
                        </td>
                        <td className="px-2 py-2 text-center">
                          {r.durationSeconds ? (
                            <div className={isClose ? 'text-green-600 font-medium' : 'text-gray-600'}>
                              <div className="text-xs">{formatDuration(r.durationSeconds)}</div>
                              <div className="text-xs text-gray-400">{formatDistance(r.distanceMeters)}</div>
                            </div>
                          ) : <span className="text-gray-200">-</span>}
                        </td>
                        <td className="px-2 py-2 text-center">
                          {!r.lastExportedAt ? (
                            <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded text-xs">New</span>
                          ) : (
                            <div className="text-xs text-gray-500">{r.exportCount}x</div>
                          )}
                        </td>
                        <td className="px-2 py-2">
                          <button onClick={() => deleteRecord(r.uniqueId)} className="text-red-400 hover:text-red-600">
                            <X className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {filteredData.length > 100 && <div className="p-3 text-center text-gray-500 bg-gray-50 text-sm">100 / {filteredData.length}</div>}
          </div>
        )}

        {!data.length && (
          <div className="bg-white rounded-xl shadow-sm p-12 text-center">
            <Database className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-xl font-medium text-gray-600">Base vide</h3>
            <p className="text-gray-400 mt-2">Importez vos fichiers Excel</p>
          </div>
        )}

        {/* Export History */}
        {exports.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm p-4">
            <h3 className="font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <History className="w-5 h-5" /> Historique exports
            </h3>
            <div className="flex flex-wrap gap-2">
              {exports.slice(-10).reverse().map(e => (
                <button key={e.id} onClick={() => setFilters(f => ({ ...f, exportDate: f.exportDate === String(e.id) ? '' : String(e.id) }))}
                  className={`px-3 py-1.5 rounded-lg text-xs flex items-center gap-2 ${filters.exportDate === String(e.id) ? 'bg-indigo-600 text-white' : 'bg-gray-100 hover:bg-gray-200'}`}>
                  <Calendar className="w-3 h-3" /> {formatDate(e.date)} • {e.count}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="bg-white rounded-xl shadow-sm p-4 text-xs text-gray-500">
          <div className="flex flex-wrap gap-4 items-center">
            <div className="flex items-center gap-2"><div className="w-3 h-3 bg-purple-100 rounded" /> &lt;20 sal.</div>
            <div className="flex items-center gap-2"><div className="w-3 h-3 bg-green-100 rounded" /> &lt;20 + &lt;30min</div>
            <div className="flex items-center gap-2"><div className="w-3 h-3 bg-orange-100 rounded" /> Doublon</div>
            <div className="flex-1" />
            <span>IndexedDB • Mapping intelligent • Import bases enrichies</span>
          </div>
        </div>
      </div>
    </div>
  );
}