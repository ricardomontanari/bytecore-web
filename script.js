// ==================================================================
// CONFIGURAÇÃO GLOBAL
// ==================================================================
const API_BASE_URL = 'https://bytecore-fleet-api.onrender.com';
let currentUser = null;
let expenseChart = null;
let base64Photo = null; // Armazena a foto tirada/carregada

// ==================================================================
// INICIALIZAÇÃO DO SISTEMA
// ==================================================================
window.onload = function() {
    // 1. Service Worker (PWA)
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js').catch(err => console.log('SW falhou:', err));
    }

    // 2. Configura Máscaras de Input
    setupInputMasks();

    // 3. Verifica Login
    const savedUser = localStorage.getItem('bytecore_user');
    if (savedUser) {
        currentUser = JSON.parse(savedUser);
        loadSystem();
    } else {
        document.getElementById('loginScreen').classList.remove('hidden');
    }

    // 4. Listeners de Eventos (Placas) para buscar KM automaticamente
    const gPlate = document.getElementById('gPlate');
    if (gPlate) gPlate.addEventListener('change', (e) => fetchLastKm(e.target.value, 'gKm'));
    
    const mPlate = document.getElementById('mPlate');
    if (mPlate) mPlate.addEventListener('change', (e) => fetchLastKm(e.target.value, 'mKmInitial'));
};

function loadSystem() {
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('mainApp').classList.remove('hidden');
    loadGlobalStats();
    loadHistory(); // Carrega histórico na Home também
}

// ==================================================================
// NAVEGAÇÃO (ABAS)
// ==================================================================
function switchTab(tabId) {
    // Esconde todas as abas
    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
    
    // Remove estilo ativo dos botões
    document.querySelectorAll('nav button').forEach(btn => {
        btn.classList.remove('text-blue-600', 'font-bold');
        btn.classList.add('text-gray-400');
    });

    // Mostra a aba selecionada
    const target = document.getElementById(tabId);
    if (target) target.classList.remove('hidden');

    // Ativa o botão correspondente
    const activeBtn = document.querySelector(`button[onclick="switchTab('${tabId}')"]`);
    if (activeBtn) {
        activeBtn.classList.remove('text-gray-400');
        activeBtn.classList.add('text-blue-600', 'font-bold');
    }

    // Ações Específicas por Aba
    if (tabId === 'history') loadHistory();
    if (tabId === 'gestor') {
        loadFleetList();
        loadCompanyData();
        loadCompanyUsers();
    }
}

function showSub(screenId) {
    // Esconde todas as sub-telas do Gestor
    ['cadVeiculo', 'frotaLista', 'gestaoUsuarios', 'configEmpresa'].forEach(id => {
        document.getElementById(id).classList.add('hidden');
    });
    // Mostra a escolhida
    document.getElementById(screenId).classList.remove('hidden');
}

// ==================================================================
// FUNÇÕES DE LOGIN / LOGOUT
// ==================================================================
async function handleLogin() {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const btn = document.querySelector('#loginScreen button');

    if (!email || !password) return alert("Preencha todos os campos.");

    try {
        btn.innerText = "Entrando...";
        btn.disabled = true;

        const res = await fetch(`${API_BASE_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });

        const data = await res.json();

        if (res.ok) {
            currentUser = data;
            localStorage.setItem('bytecore_user', JSON.stringify(data));
            loadSystem();
        } else {
            alert(data.error || "Erro ao entrar.");
        }
    } catch (e) {
        alert("Erro de conexão.");
        console.error(e);
    } finally {
        btn.innerText = "Entrar";
        btn.disabled = false;
    }
}

function logout() {
    if(confirm("Deseja realmente sair?")) {
        localStorage.removeItem('bytecore_user');
        location.reload();
    }
}

// ==================================================================
// FUNÇÕES DE DADOS (API)
// ==================================================================

// 1. Preencher Seletores de Veículos
async function fillVehicleSelectors() {
    try {
        if (!currentUser || !currentUser.company_id) return;

        const r = await fetch(`${API_BASE_URL}/company/${currentUser.company_id}/vehicles`);
        if (!r.ok) throw new Error('Falha ao buscar veículos');
        
        const vehicles = await r.json();
        const options = vehicles.length > 0 
            ? '<option value="">Escolha o Veículo</option>' + vehicles.map(v => `<option value="${v.plate}">${v.plate} - ${v.model}</option>`).join('')
            : '<option value="">Nenhum veículo encontrado</option>';

        ['searchPlate', 'gPlate', 'mPlate'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = options;
        });
    } catch (e) { console.error("Erro ao carregar veículos:", e); }
}

// 2. Buscar KM Anterior (Automático)
async function fetchLastKm(plate, targetId) {
    if (!plate || !currentUser) return;
    try {
        const res = await fetch(`${API_BASE_URL}/vehicle/next-km/${plate}/${currentUser.company_id}`);
        if (res.ok) {
            const data = await res.json();
            const input = document.getElementById(targetId);
            if (input) input.value = data.next_km;
        }
    } catch (e) { console.error("Erro KM:", e); }
}

// 3. Salvar Abastecimento
async function saveFuelEntry() {
    const plate = document.getElementById('gPlate').value;
    const km = document.getElementById('gKm').value;
    const liters = document.getElementById('gLiters').value;
    const price = document.getElementById('gPrice').value;
    const date = document.getElementById('gDate').value;

    if (!plate || !km || !liters || !price || !date) {
        return alert("Preencha todos os campos.");
    }

    const payload = {
        id: Date.now().toString(),
        plate,
        type: 'Abastecimento',
        value: parseFloat(liters) * parseFloat(price),
        date,
        km_final: parseInt(km), // Assume-se que o KM digitado é o final
        liters: parseFloat(liters),
        price_per_liter: parseFloat(price),
        company_id: currentUser.company_id,
        receipt_image: base64Photo
    };

    try {
        const r = await fetch(`${API_BASE_URL}/movements`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (r.ok) {
            alert("Salvo com sucesso!");
            document.getElementById('gKm').value = "";
            document.getElementById('gLiters').value = "";
            removePhoto(); // Limpa foto
            switchTab('dashboard');
            loadGlobalStats();
        } else {
            alert("Erro ao salvar.");
        }
    } catch (e) { console.error(e); alert("Erro de conexão."); }
}

// 4. Salvar Manutenção
async function saveMaintenance() {
    const plate = document.getElementById('mPlate').value;
    const date = document.getElementById('mDateTime').value;
    const km = document.getElementById('mKmInitial').value;
    const total = document.getElementById('mTotalValue').value;
    const desc = document.getElementById('mDesc').value;

    if (!plate || !total || !date) return alert("Preencha os campos obrigatórios.");

    const payload = {
        id: Date.now().toString(),
        plate,
        type: 'Manutenção',
        value: parseFloat(total),
        date,
        km_initial: parseInt(km),
        parts_used: desc,
        company_id: currentUser.company_id,
        receipt_image: base64Photo
    };

    try {
        const r = await fetch(`${API_BASE_URL}/movements`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (r.ok) {
            alert("Manutenção registrada!");
            removePhoto();
            switchTab('dashboard');
            loadGlobalStats();
        } else { alert("Erro ao salvar."); }
    } catch (e) { console.error(e); }
}

// 5. Carregar Histórico
async function loadHistory() {
    try {
        if (!currentUser) return;
        const res = await fetch(`${API_BASE_URL}/company/${currentUser.company_id}/movements`);
        const movements = await res.json();
        const container = document.getElementById('activityHistory');

        if (!container) return;
        if (movements.length === 0) {
            container.innerHTML = '<p class="text-center text-gray-500 py-4">Sem atividades.</p>';
            return;
        }

        container.innerHTML = movements.map(m => {
            const isFuel = m.type === 'Abastecimento' || m.type === 'FUEL';
            const icon = isFuel ? 'ph-gas-pump' : 'ph-wrench';
            const color = isFuel ? 'text-orange-600 bg-orange-100' : 'text-blue-600 bg-blue-100';
            
            return `
            <div class="flex items-center justify-between p-4 border-b border-gray-100">
                <div class="flex items-center gap-4">
                    <div class="w-12 h-12 ${color} rounded-xl flex items-center justify-center">
                        <i class="ph-fill ${icon} text-2xl"></i>
                    </div>
                    <div>
                        <h4 class="font-bold text-slate-800">${m.plate}</h4>
                        <p class="text-sm text-slate-500">${m.type} • ${m.date}</p>
                    </div>
                </div>
                <div class="text-right">
                    <p class="font-bold text-slate-800">R$ ${parseFloat(m.value).toFixed(2)}</p>
                    ${m.receipt_image ? `<button onclick="openPhotoModal('${m.receipt_image}')" class="text-blue-500 text-sm"><i class="ph-fill ph-image"></i> Ver Foto</button>` : ''}
                </div>
            </div>`;
        }).join('');
    } catch (e) { console.error("Erro Histórico:", e); }
}

// 6. Carregar Frota
async function loadFleetList() {
    try {
        if (!currentUser) return;
        const res = await fetch(`${API_BASE_URL}/company/${currentUser.company_id}/vehicles`);
        const vehicles = await res.json();
        const container = document.getElementById('fleetList');
        
        if (!container) return;
        container.innerHTML = vehicles.map(v => `
            <div class="bg-white p-4 rounded-xl shadow-sm border mb-3 flex justify-between">
                <div>
                    <h4 class="font-bold text-slate-800">${v.plate}</h4>
                    <p class="text-sm text-slate-500">${v.model}</p>
                </div>
                <div class="text-right">
                    <p class="text-xs text-slate-400">KM Inicial</p>
                    <p class="font-bold text-blue-600">${v.initial_km}</p>
                </div>
            </div>
        `).join('');
    } catch (e) { console.error("Erro Frota:", e); }
}

// 7. Cadastrar Veículo
async function registerVehicle() {
    const plate = document.getElementById('vPlate').value;
    const model = document.getElementById('vModel').value;
    const km = document.getElementById('vKm').value;

    if (!plate || !model || !km) return alert("Preencha tudo.");

    try {
        const r = await fetch(`${API_BASE_URL}/vehicles`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ plate, model, initial_km: km, company_id: currentUser.company_id })
        });
        
        if (r.ok) {
            alert("Veículo criado!");
            document.getElementById('vPlate').value = "";
            loadFleetList();
        } else {
            const err = await r.json();
            alert("Erro: " + err.error);
        }
    } catch (e) { console.error(e); }
}

// 8. Dados da Empresa e Usuários
async function loadCompanyData() {
    try {
        const res = await fetch(`${API_BASE_URL}/company/${currentUser.company_id}`);
        if(res.ok) {
            const data = await res.json();
            const title = document.getElementById('companyTitle');
            if(title) title.innerText = data.name || data.domain;
        }
    } catch(e) { console.error(e); }
}

async function loadCompanyUsers() {
    try {
        const res = await fetch(`${API_BASE_URL}/company/${currentUser.company_id}/users`);
        if(res.ok) {
            const users = await res.json();
            const list = document.getElementById('usersList');
            if(list) {
                list.innerHTML = users.map(u => `
                    <div class="p-3 border-b flex justify-between">
                        <span>${u.name}</span>
                        <span class="text-xs bg-gray-200 px-2 rounded">${u.role}</span>
                    </div>
                `).join('');
            }
        }
    } catch(e) { console.error(e); }
}

// ==================================================================
// FUNÇÕES AUXILIARES (Gráficos, Fotos, Máscaras)
// ==================================================================

function loadGlobalStats() {
    // Carrega estatísticas básicas (Simulado por enquanto para não travar se rota all-movements demorar)
    // Para implementação real, conecte com /all-movements e some os valores
    console.log("Atualizando estatísticas...");
}

function handlePhoto(input) {
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = function(e) {
            base64Photo = e.target.result;
            // Mostra preview
            const preview = document.getElementById('receiptPhoto');
            if (preview) {
                preview.style.backgroundImage = `url(${base64Photo})`;
                preview.classList.remove('hidden');
            }
        };
        reader.readAsDataURL(input.files[0]);
    }
}

function removePhoto() {
    base64Photo = null;
    const preview = document.getElementById('receiptPhoto');
    if (preview) {
        preview.style.backgroundImage = '';
        preview.classList.add('hidden');
    }
}

function openPhotoModal(src) {
    const modal = document.getElementById('photoModal');
    const img = document.getElementById('modalImage');
    if (modal && img) {
        img.src = src;
        modal.classList.remove('hidden');
    }
}

function closePhotoModal() {
    const modal = document.getElementById('photoModal');
    if (modal) modal.classList.add('hidden');
}

function setupInputMasks() {
    // Exemplo simples de máscara. Use bibliotecas como IMask para algo robusto.
    const plateInput = document.getElementById('vPlate');
    if (plateInput) {
        plateInput.addEventListener('input', function(e) {
            e.target.value = e.target.value.toUpperCase();
        });
    }
}