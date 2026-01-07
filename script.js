// ==================================================================
// CONFIGURAÇÃO GLOBAL
// ==================================================================
const API_BASE_URL = 'https://bytecore-fleet-api.onrender.com';
let currentUser = null;
let expenseChart = null;
let base64Photo = null;
let tempServices = [];
let tempParts = [];
let currentHistoryData = [];

// ==================================================================
// INICIALIZAÇÃO DO SISTEMA
// ==================================================================
window.onload = function() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js').catch(err => console.log('SW falhou:', err));
    }

    setupInputMasks();
    setupFuelCalculation();

    const savedUser = localStorage.getItem('bytecore_user');
    if (savedUser) {
        currentUser = JSON.parse(savedUser);
        loadSystem();
    } else {
        document.getElementById('loginScreen').classList.remove('hidden');
    }

    const now = new Date();
    const todayString = now.toISOString().split('T')[0];

    // Preenche as datas em todos os campos padronizados
    if (document.getElementById('gDate')) document.getElementById('gDate').value = todayString;
    if (document.getElementById('mDateTime')) document.getElementById('mDateTime').value = todayString;
    if (document.getElementById('tripEndDate')) document.getElementById('tripEndDate').value = todayString;

    const mPlateSelect = document.getElementById('mPlate');
    if (mPlateSelect) {
        mPlateSelect.addEventListener('change', () => {
            // Se já estiver na tela de troca de óleo e mudar o carro, busca os dados daquele carro
            if (document.getElementById('mDesc').value === 'Troca de Óleo') {
                fetchLastOilChangeData();
            }
        });
    }
};

async function loadSystem() {
    if (!currentUser) return;

    // Esconde login e mostra app
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('mainApp').classList.remove('hidden');

    try {
        await fillVehicleSelectors();
        await loadGlobalStats();
        await loadServicesList();
        updateDashboardSummary();
        loadSettings();
        loadHistory();
        loadTripsHistory();

    } catch (error) {
        console.error("Erro na carga do sistema:", error);
    }
}

// ==================================================================
// NAVEGAÇÃO (ABAS)
// ==================================================================
function switchTab(tabId) {
    const now = new Date();
    const todayString = now.toLocaleDateString('en-CA'); // Formato YYYY-MM-DD
    const fDate = document.getElementById('gDate');
    if(fDate && !fDate.value) fDate.value = todayString; // Preenche só se estiver vazio

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
    if (tabId === 'launch') {
        toggleLaunchView('fuel');
    }
    if (tabId === 'history') {
        toggleHistoryView('recent');
    }
    if (tabId === 'gestor') {
        toggleGestorView('cad'); 
        loadCompanyData();
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

// Preencher Seletores de Veículos
async function fillVehicleSelectors() {
    try {
        if (!currentUser || !currentUser.company_id) return;

        const r = await fetch(`${API_BASE_URL}/company/${currentUser.company_id}/vehicles`);
        if (!r.ok) throw new Error('Falha ao buscar veículos');
        
        const vehiclesData = await r.json(); // Mudamos o nome para evitar conflito
        
        // Criamos as opções uma única vez
        const options = vehiclesData.length > 0 
            ? '<option value="">Escolha o Veículo</option>' + vehiclesData.map(v => `<option value="${v.plate}">${v.plate} - ${v.model}</option>`).join('')
            : '<option value="">Nenhum veículo encontrado</option>';

        // Preenche todos os selects do seu HTML pelos IDs corretos
        const targets = ['gPlate', 'mPlate', 'closeTripVehicle', 'searchPlate'];
        targets.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = options;
        });

    } catch (e) { 
        console.error("Erro ao carregar veículos:", e); 
    }
}

// Buscar KM Anterior (Automático)
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

// Salvar Abastecimento
async function saveFuelEntry() {
    const plate = document.getElementById('gPlate').value;
    const km = document.getElementById('gKm').value;
    const liters = document.getElementById('gLiters').value;
    const price = document.getElementById('gPrice').value;
    const dateInput = document.getElementById('gDate').value; 

    // 1. Validação Básica
    if (!plate || !km || !liters || !price || !dateInput) {
        return alert("Preencha todos os campos.");
    }

    // 2. Validação de Data (Front-End)
    const selectedDate = new Date(dateInput);
    const today = new Date();
    // Zera as horas para comparar apenas o dia
    today.setHours(0, 0, 0, 0);
    selectedDate.setHours(0, 0, 0, 0);

    // Ajuste de fuso horário simples: se selected > today
    if (selectedDate > today) {
        return alert("Erro: Não é permitido lançar datas futuras.");
    }

    const payload = {
        id: Date.now().toString(),
        plate,
        type: 'Abastecimento',
        value: parseFloat(liters) * parseFloat(price),
        date: dateInput,
        km_final: parseInt(km),
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
            // Limpa campos, mas mantém a data de hoje para facilitar o próximo
            document.getElementById('gKm').value = "";
            document.getElementById('gLiters').value = "";
            removePhoto(); 
            switchTab('dashboard');
            loadGlobalStats();
        } else {
            // Se o servidor bloquear, mostramos o erro aqui
            const err = await r.json();
            alert("Erro: " + (err.error || "Erro ao salvar."));
        }
    } catch (e) { 
        console.error(e); 
        alert("Erro de conexão."); 
    }
}

// Salvar Manutenção
async function saveMaintenance() {
    const plate = document.getElementById('mPlate').value;
    const type = document.getElementById('mDesc').value; // Agora é um Select
    const date = document.getElementById('mDateTime').value;
    const km = document.getElementById('mKmInitial').value;
    const total = document.getElementById('mTotalValue').value;
    const kmPrev = document.getElementById('mKmPrev').value; // Específico de óleo

    if (!plate || !total || !date || !type) return alert("Preencha os campos obrigatórios.");

    // Monta o objeto JSON de detalhes
    const details = {
        service_type: type,
        km_previous: kmPrev || null, // Salva se tiver
        services_list: tempServices, // Array de serviços
        parts_list: tempParts,       // Array de peças
        services_total: tempServices.reduce((a, b) => a + b.value, 0),
        parts_total: tempParts.reduce((a, b) => a + b.value, 0)
    };

    const payload = {
        id: Date.now().toString(),
        plate,
        type: 'Manutenção', // Tipo genérico no banco
        value: parseFloat(total),
        date,
        km_initial: parseInt(km),
        // O campo parts_used antigo agora pode ser uma string resumo ou ficar vazio
        parts_used: `${type} - ${tempParts.length} peças`, 
        company_id: currentUser.company_id,
        receipt_image: base64Photo,
        details: JSON.stringify(details) // ENVIANDO O JSON NOVO
    };

    try {
        const r = await fetch(`${API_BASE_URL}/movements`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (r.ok) {
            alert("Registro salvo com sucesso!");
            
            // Limpeza
            removePhoto();
            tempServices = [];
            tempParts = [];
            updateListsUI();
            
            // Volta para dashboard
            switchTab('dashboard');
            loadGlobalStats();
        } else {
            const err = await r.json();
            alert("Erro: " + (err.error || "Erro desconhecido"));
        }
    } catch (e) { console.error(e); }
}

// Carregar Histórico
async function loadHistory() {
    try {
        if (!currentUser) return;
        const res = await fetch(`${API_BASE_URL}/company/${currentUser.company_id}/movements`);
        const movements = await res.json();

        // SALVA NA GLOBAL PARA O MODAL USAR
        currentHistoryData = movements;

        const container = document.getElementById('activityHistory');
        if (!container) return;
        
        if (movements.length === 0) {
            container.innerHTML = '<p class="text-center text-gray-400 py-8">Sem atividades recentes.</p>';
            return;
        }

        // Gera o HTML
        container.innerHTML = movements.map((m, index) => {
            const isFuel = m.type === 'Abastecimento' || m.type === 'FUEL';
            const icon = isFuel ? 'ph-gas-pump' : 'ph-wrench';
            const colorBg = isFuel ? 'bg-orange-50 text-orange-600' : 'bg-blue-50 text-blue-600';
            
            // Tratamento do nome do serviço (se tiver details, usa o tipo específico)
            let serviceName = m.type;
            if (m.details) {
                const det = typeof m.details === 'string' ? JSON.parse(m.details) : m.details;
                if (det.service_type) serviceName = det.service_type;
            }

            const dateFmt = new Date(m.date).toLocaleDateString('pt-BR', { timeZone: 'UTC' });

            return `
            <div onclick="openDetailsModal(${index})" class="cursor-pointer flex items-start justify-between p-4 border-b border-gray-50 last:border-0 hover:bg-slate-50 transition-colors active:bg-slate-100">
                <div class="flex items-start gap-3">
                    <div class="w-10 h-10 ${colorBg} rounded-lg flex items-center justify-center shrink-0 mt-1">
                        <i class="ph-fill ${icon} text-xl"></i>
                    </div>
                    <div class="flex flex-col">
                        <span class="font-bold text-slate-800 text-sm">${m.plate}</span>
                        <span class="text-xs text-slate-600 font-medium mt-0.5">${serviceName}</span>
                        <span class="text-[10px] text-slate-400 mt-0.5 flex items-center gap-1">
                            <i class="ph-bold ph-calendar-blank"></i> ${dateFmt}
                        </span>
                    </div>
                </div>
                <div class="flex flex-col items-end gap-1">
                    <span class="font-bold text-slate-800 text-sm whitespace-nowrap">
                        R$ ${parseFloat(m.value).toFixed(2)}
                    </span>
                    <span class="text-[10px] text-blue-500 font-bold bg-blue-50 px-2 py-1 rounded-md">
                        Ver Detalhes
                    </span>
                </div>
            </div>`;
        }).join('');
    } catch (e) { console.error("Erro Histórico:", e); }
}

// Carregar Frota
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

// Cadastrar Veículo
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
            document.getElementById('vModel').value = "";
            document.getElementById('vKm').value = "";
            toggleAccordion('formNewVehicle');
            loadFleetList();
        } else {
            const err = await r.json();
            alert("Erro: " + err.error);
        }
    } catch (e) { console.error(e); }
}

// Função para cadastrar novo serviço
async function registerService() {
    const nameInput = document.getElementById('sName');
    const name = nameInput ? nameInput.value.trim() : "";

    if (!name) return alert("Por favor, digite o nome do serviço.");

    try {
        const response = await fetch(`${API_BASE_URL}/services`, {
            method: 'POST',
            mode: 'cors',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                name: name, 
                company_id: currentUser.company_id 
            })
        });

        if (response.ok) {
            alert("✅ Tipo de serviço cadastrado!");
            nameInput.value = "";
            toggleAccordion('formNewService');
            loadServicesList(); 
        } else {
            const err = await response.json();
            alert("Erro: " + (err.error || "Falha no servidor"));
        }
    } catch (error) {
        console.error("Erro ao cadastrar serviço:", error);
        alert("Erro de CORS ou Conexão. Verifique se o servidor permite este domínio.");
    }
}

// Função para carregar os serviços nos campos de SELECT
async function loadServicesList() {
    if (!currentUser) return;

    try {
        const response = await fetch(`${API_BASE_URL}/company/${currentUser.company_id}/services`);
        const services = await response.json();
        
        const selectMaint = document.getElementById('mDesc');
        if (!selectMaint) return;

        selectMaint.innerHTML = '<option value="">Selecione o serviço...</option>';
        
        services.forEach(service => {
            const option = document.createElement('option');
            option.value = service.name;
            option.textContent = service.name;
            selectMaint.appendChild(option);
        });
    } catch (error) {
        console.error("Erro ao carregar lista de serviços:", error);
    }
}

// Dados da Empresa
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

// Dados do Usuários
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

// Dados de Valor por KM
async function loadSettings() {
    if (!currentUser) return;
    try {
        const response = await fetch(`${API_BASE_URL}/company/${currentUser.company_id}/settings`);
        const data = await response.json();
        document.getElementById('inputPerKmValue').value = data.per_km_value;
    } catch (error) {
        console.error('Erro ao carregar configurações:', error);
    }
}

async function saveSettings() {
    const val = document.getElementById('inputPerKmValue').value;
    if (!val) return alert("Insira um valor válido");

    try {
        const response = await fetch(`${API_BASE_URL}/settings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                per_km_value: parseFloat(val),
                company_id: currentUser.company_id
            })
        });

        if (response.ok) {
            alert("Configuração salva com sucesso!");
        }
    } catch (error) {
        alert("Erro ao salvar configuração");
    }
}

// Dados de Viagens
async function submitCloseTrip() {
    const btn = event.currentTarget;
    const plate = document.getElementById('closeTripVehicle').value;
    const end_km = document.getElementById('closeTripKmFinal').value;
    const toll_cost = document.getElementById('closeTripToll').value;
    const tripDate = document.getElementById('tripEndDate').value;

    if (!plate || !end_km) return alert("Preencha a Placa e o KM Final!");

    // Feedback visual de carregamento
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = "Processando...";

    try {
        const response = await fetch(`${API_BASE_URL}/trips/close`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                plate,
                company_id: currentUser.company_id,
                end_km: parseInt(end_km),
                toll_cost: parseFloat(toll_cost || 0),
                date: tripDate
            })
        });

        const result = await response.json();

        if (response.ok) {
            alert("✅ Viagem Fechada!\n" + 
                  "Lucro: R$ " + result.data.net_profit.toFixed(2) + "\n" +
                  "Média: " + result.data.average_consumption + " KM/L");
            
            // Limpar campos
            document.getElementById('closeTripKmFinal').value = '';
            document.getElementById('closeTripToll').value = '';
            
            // Atualizar Dashboard e Histórico
            loadSystem(); 
        } else {
            alert("Erro: " + result.error);
        }
    } catch (error) {
        alert("Falha na conexão com o servidor.");
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

// Dados do Dashboard
async function updateDashboardSummary() {
    if (!currentUser) return;
    
    try {
        const response = await fetch(`${API_BASE_URL}/company/${currentUser.company_id}/dashboard-summary`);
        const data = await response.json();

        // Elementos do Dashboard
        const elProfit = document.getElementById('monthlyProfitDisplay');
        const elRev = document.getElementById('monthlyRevenueDisplay');
        const elExp = document.getElementById('monthlyExpensesDisplay');

        // Formatador de moeda
        const btcCurrency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

        // Só atualiza se o elemento existir no HTML
        if (elProfit) elProfit.innerText = btcCurrency.format(data.total_profit || 0);
        if (elRev) elRev.innerText = btcCurrency.format(data.total_revenue || 0);
        if (elExp) elExp.innerText = btcCurrency.format(data.total_expenses || 0);

    } catch (error) {
        console.error("Erro ao atualizar dashboard:", error);
    }
}

// Dados do Histórico de Viagens
async function loadTripsHistory() {
    if (!currentUser) return;
    const container = document.getElementById('tripsList');
    if (!container) return;

    try {
        const response = await fetch(`${API_BASE_URL}/company/${currentUser.company_id}/trips`);
        const trips = await response.json();

        container.innerHTML = trips.map(trip => `
            <div class="bg-white p-4 rounded-2xl shadow-sm border border-slate-200">
                <div class="flex justify-between items-start mb-3">
                    <div>
                        <span class="text-xs font-bold text-blue-600 uppercase tracking-wider">${trip.plate}</span>
                        <h4 class="font-bold text-slate-800">${trip.model}</h4>
                    </div>
                    <span class="text-xs text-slate-400">${new Date(trip.end_date).toLocaleDateString('pt-BR')}</span>
                </div>
                
                <div class="grid grid-cols-2 gap-4 py-3 border-y border-slate-50 my-3">
                    <div>
                        <p class="text-[10px] text-slate-400 uppercase">Distância</p>
                        <p class="font-bold text-slate-700">${trip.distance_run} KM</p>
                    </div>
                    <div>
                        <p class="text-[10px] text-slate-400 uppercase">Média Consumo</p>
                        <p class="font-bold text-slate-700">${parseFloat(trip.average_consumption).toFixed(2)} KM/L</p>
                    </div>
                </div>

                <div class="flex justify-between items-center">
                    <div>
                        <p class="text-[10px] text-slate-400 uppercase">Lucro Líquido</p>
                        <p class="font-bold text-green-600">R$ ${parseFloat(trip.net_profit).toFixed(2)}</p>
                    </div>
                    <div class="text-right">
                        <p class="text-[10px] text-slate-400 uppercase">Pedágio</p>
                        <p class="text-sm font-medium text-slate-600 text-red-400">- R$ ${parseFloat(trip.toll_cost).toFixed(2)}</p>
                    </div>
                </div>
            </div>
        `).join('');

    } catch (error) {
        console.error("Erro ao carregar histórico de viagens:", error);
    }
}

// Função Lançamentos
function toggleLaunchView(view) {
    // IDs das seções
    const sections = {
        fuel: document.getElementById('formFuel'),
        maint: document.getElementById('formMaint'),
        trip: document.getElementById('formTrip')
    };

    // IDs dos botões
    const buttons = {
        fuel: document.getElementById('btnLaunchFuel'),
        maint: document.getElementById('btnLaunchMaint'),
        trip: document.getElementById('btnLaunchTrip')
    };

    // Reseta todos os botões e esconde seções
    Object.keys(sections).forEach(key => {
        if (sections[key]) sections[key].classList.add('hidden');
        if (buttons[key]) {
            buttons[key].classList.remove('bg-blue-100', 'text-blue-700');
            buttons[key].classList.add('text-slate-500');
        }
    });

    // Ativa a seção e o botão selecionado
    if (sections[view]) sections[view].classList.remove('hidden');
    if (buttons[view]) {
        buttons[view].classList.add('bg-blue-100', 'text-blue-700');
        buttons[view].classList.remove('text-slate-500');
    }
}

// Função Histórico
function toggleHistoryView(view) {
    const btnRecent = document.getElementById('btnShowRecent');
    const btnTrips = document.getElementById('btnShowTrips');
    const secRecent = document.getElementById('sectionRecentHistory');
    const secTrips = document.getElementById('sectionTripsHistory');

    if (view === 'recent') {
        // Estilo dos botões
        btnRecent.classList.add('bg-blue-100', 'text-blue-700');
        btnRecent.classList.remove('text-slate-500');
        btnTrips.classList.remove('bg-blue-100', 'text-blue-700');
        btnTrips.classList.add('text-slate-500');

        // Visibilidade das seções
        secRecent.classList.remove('hidden');
        secTrips.classList.add('hidden');
        loadHistory(); // Recarrega os movimentos
    } else {
        // Estilo dos botões
        btnTrips.classList.add('bg-blue-100', 'text-blue-700');
        btnTrips.classList.remove('text-slate-500');
        btnRecent.classList.remove('bg-blue-100', 'text-blue-700');
        btnRecent.classList.add('text-slate-500');

        // Visibilidade das seções
        secTrips.classList.remove('hidden');
        secRecent.classList.add('hidden');
        loadTripsHistory(); // Recarrega as viagens
    }
}

// Função Configurações
function toggleGestorView(view) {
    const sections = {
        cad: document.getElementById('secGestorCad'),
        fleet: document.getElementById('secGestorFleet'),
        params: document.getElementById('secGestorParams')
    };

    const buttons = {
        cad: document.getElementById('btnGestorCad'),
        fleet: document.getElementById('btnGestorFleet'),
        params: document.getElementById('btnGestorParams')
    };

    // Reseta botões e esconde seções
    Object.keys(sections).forEach(key => {
        if (sections[key]) sections[key].classList.add('hidden');
        if (buttons[key]) {
            buttons[key].classList.remove('bg-blue-100', 'text-blue-700');
            buttons[key].classList.add('text-slate-500');
        }
    });

    // Mostra a seção escolhida e ativa o botão
    if (sections[view]) sections[view].classList.remove('hidden');
    if (buttons[view]) {
        buttons[view].classList.add('bg-blue-100', 'text-blue-700');
        buttons[view].classList.remove('text-slate-500');
    }

    // Carregamento de dados específicos
    if (view === 'fleet') {
        loadFleetList();
        loadCompanyUsers();
    }
}

// Função para abrir/fechar painéis (Accordion)
function toggleAccordion(elementId) {
    const content = document.getElementById(elementId);
    if (!content) return;
    const iconMap = {
        'formNewVehicle': 'iconNewVehicle',
        'formNewService': 'iconNewService',
        'listFleet': 'iconFleet',
        'listUsers': 'iconUsers'
    };
    
    const iconId = iconMap[elementId];
    const icon = document.getElementById(iconId);
    
    if (content.classList.contains('hidden')) {
        content.classList.remove('hidden');
        if (icon) icon.style.transform = 'rotate(180deg)';
    } else {
        content.classList.add('hidden');
        if (icon) icon.style.transform = 'rotate(0deg)';
    }
}

// Função para calcular total do abastecimento em tempo real
function setupFuelCalculation() {
    const litersInput = document.getElementById('gLiters');
    const priceInput = document.getElementById('gPrice');
    const totalInput = document.getElementById('gTotalCalc');

    function calculate() {
        const liters = parseFloat(litersInput.value) || 0;
        const price = parseFloat(priceInput.value) || 0;
        
        // Calcula e fixa em 2 casas decimais
        const total = liters * price;
        
        // Formata para o padrão brasileiro (vírgula)
        totalInput.value = total.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    // Adiciona o evento de digitação nos dois campos
    if (litersInput && priceInput) {
        litersInput.addEventListener('input', calculate);
        priceInput.addEventListener('input', calculate);
    }
}

// 1. Renderiza os campos com base na seleção (Óleo, Lavagem, Manutenção)
function renderMaintenanceFields() {
    const type = document.getElementById('mDesc').value;
    
    // Blocos
    const blockKmPrev = document.getElementById('blockKmPrev');
    const blockServices = document.getElementById('blockServicesList');
    const blockParts = document.getElementById('blockPartsList');

    // Reset visual
    blockKmPrev.classList.add('hidden');
    blockServices.classList.add('hidden');
    blockParts.classList.add('hidden');
    
    // Lógica de Exibição
    if (type === 'Troca de Óleo') {
        blockKmPrev.classList.remove('hidden');
        blockParts.classList.remove('hidden'); // Óleo tem peças (óleo, filtro)
    } 
    else if (type === 'Manutenção Geral' || type === 'Manutenção') {
        blockServices.classList.remove('hidden'); // Mão de obra
        blockParts.classList.remove('hidden');    // Peças
    } 
    else if (type === 'Lavagem') {
        blockServices.classList.remove('hidden'); // Apenas serviços
    }

    // Se selecionou outro serviço customizado que não seja os padrão, mostra tudo por segurança
    else if (type !== "") {
        blockServices.classList.remove('hidden');
        blockParts.classList.remove('hidden');
    }

    if (type === 'Troca de Óleo') {
        fetchLastOilChangeData();
    }
}

// 2. Adiciona item à lista (Memória e Tela)
function addItemToList(category) {
    const nameId = category === 'service' ? 'addServName' : 'addPartName';
    const valId = category === 'service' ? 'addServValue' : 'addPartValue';
    
    const nameEl = document.getElementById(nameId);
    const valEl = document.getElementById(valId);
    
    const name = nameEl.value.trim();
    const val = parseFloat(valEl.value);

    if (!name || isNaN(val)) return alert("Preencha nome e valor!");

    const item = { name, value: val };

    if (category === 'service') {
        tempServices.push(item);
    } else {
        tempParts.push(item);
    }

    // Limpa inputs
    nameEl.value = '';
    valEl.value = '';

    updateListsUI();
}

// 3. Atualiza a UI das listas e calcula o Total Geral
function updateListsUI() {
    const listServ = document.getElementById('listServicesRender');
    const listPart = document.getElementById('listPartsRender');
    
    // Renderiza Serviços
    listServ.innerHTML = tempServices.map((item, index) => `
        <li class="flex justify-between items-center bg-slate-50 p-2 rounded border border-slate-100">
            <span>${item.name}</span>
            <div class="flex items-center gap-3">
                <span class="font-bold">R$ ${item.value.toFixed(2)}</span>
                <button onclick="removeItem('service', ${index})" class="text-red-500"><i class="ph-bold ph-trash"></i></button>
            </div>
        </li>
    `).join('');

    // Renderiza Peças
    listPart.innerHTML = tempParts.map((item, index) => `
        <li class="flex justify-between items-center bg-orange-50 p-2 rounded border border-orange-100">
            <span>${item.name}</span>
            <div class="flex items-center gap-3">
                <span class="font-bold text-orange-700">R$ ${item.value.toFixed(2)}</span>
                <button onclick="removeItem('part', ${index})" class="text-red-500"><i class="ph-bold ph-trash"></i></button>
            </div>
        </li>
    `).join('');

    // Calcula Totais
    const totalServ = tempServices.reduce((acc, item) => acc + item.value, 0);
    const totalPart = tempParts.reduce((acc, item) => acc + item.value, 0);
    const grandTotal = totalServ + totalPart;

    // Atualiza Displays
    document.getElementById('totalServicesDisplay').innerText = `R$ ${totalServ.toFixed(2)}`;
    document.getElementById('totalPartsDisplay').innerText = `R$ ${totalPart.toFixed(2)}`;
    
    // Atualiza o Input Total Principal
    const totalInput = document.getElementById('mTotalValue');
    totalInput.value = grandTotal.toFixed(2);
    
    // Se tiver itens na lista, bloqueia edição manual do total para evitar erro
    if (tempServices.length > 0 || tempParts.length > 0) {
        totalInput.setAttribute('readonly', true);
        totalInput.classList.add('bg-slate-100');
    } else {
        totalInput.removeAttribute('readonly');
        totalInput.classList.remove('bg-slate-100');
    }
}

// 4. Remove item da lista
function removeItem(category, index) {
    if (category === 'service') {
        tempServices.splice(index, 1);
    } else {
        tempParts.splice(index, 1);
    }
    updateListsUI();
}

// Função Inteligente para buscar última troca de óleo
async function fetchLastOilChangeData() {
    const plate = document.getElementById('mPlate').value;
    const type = document.getElementById('mDesc').value;
    const inputKmPrev = document.getElementById('mKmPrev');

    // Só executa se tiver placa selecionada e for Troca de Óleo
    if (!plate || type !== 'Troca de Óleo' || !currentUser) return;

    // Feedback visual (opcional)
    inputKmPrev.placeholder = "Buscando...";

    try {
        const res = await fetch(`${API_BASE_URL}/vehicle/last-oil/${plate}/${currentUser.company_id}`);
        const data = await res.json();

        if (data.found) {
            // Se achou histórico: Preenche e BLOQUEIA edição
            inputKmPrev.value = data.km;
            inputKmPrev.setAttribute('readonly', true);
            inputKmPrev.classList.add('bg-slate-200', 'text-slate-500'); // Visual de bloqueado
            inputKmPrev.classList.remove('bg-slate-50');
        } else {
            // Se é a primeira vez: Deixa vazio e PERMITE edição
            inputKmPrev.value = "";
            inputKmPrev.removeAttribute('readonly');
            inputKmPrev.classList.remove('bg-slate-200', 'text-slate-500');
            inputKmPrev.classList.add('bg-slate-50');
            inputKmPrev.placeholder = "Informe o KM da última troca";
        }
    } catch (error) {
        console.error("Erro ao buscar histórico de óleo", error);
    }
}

// Função para abrir o modal e preencher os dados
function openDetailsModal(index) {
    const item = currentHistoryData[index];
    if (!item) return;

    const modal = document.getElementById('detailsModal');
    const title = document.getElementById('detTitle');
    const sub = document.getElementById('detSubtitle');
    const content = document.getElementById('detContent');
    const total = document.getElementById('detTotal');

    // 1. Cabeçalho Básico
    title.innerText = item.type;
    sub.innerText = `${item.plate} • ${new Date(item.date).toLocaleDateString('pt-BR')}`;
    total.innerText = `R$ ${parseFloat(item.value).toFixed(2)}`;

    // 2. Processamento do Conteúdo (JSON)
    let html = '';

    // Se tiver imagem, mostra primeiro
    if (item.receipt_image) {
        html += `
            <div class="mb-4">
                <p class="text-xs font-bold text-slate-400 uppercase mb-2">Comprovante</p>
                <div onclick="openPhotoModal('${item.receipt_image}')" class="h-32 rounded-xl bg-cover bg-center border border-slate-200 shadow-sm cursor-pointer" style="background-image: url('${item.receipt_image}')"></div>
            </div>
        `;
    }

    // Se for Manutenção e tiver detalhes JSON
    if (item.type === 'Manutenção' && item.details) {
        // Tenta fazer o parse se vier como string, senão usa direto
        const det = typeof item.details === 'string' ? JSON.parse(item.details) : item.details;

        // Bloco de KMs
        html += `
            <div class="grid grid-cols-2 gap-3 mb-4">
                <div class="bg-slate-50 p-3 rounded-xl border border-slate-100">
                    <p class="text-[10px] text-slate-400 uppercase">KM Atual</p>
                    <p class="font-bold text-slate-700">${item.km_initial || '-'}</p>
                </div>
                ${det.km_previous ? `
                <div class="bg-slate-50 p-3 rounded-xl border border-slate-100">
                    <p class="text-[10px] text-slate-400 uppercase">KM Anterior</p>
                    <p class="font-bold text-slate-500">${det.km_previous}</p>
                </div>` : ''}
            </div>
        `;

        // Lista de Peças
        if (det.parts_list && det.parts_list.length > 0) {
            html += `<h4 class="font-bold text-slate-700 text-sm mb-2 flex items-center gap-2"><i class="ph-bold ph-engine text-orange-500"></i> Peças / Produtos</h4>`;
            html += `<ul class="space-y-2 mb-4">`;
            det.parts_list.forEach(p => {
                html += `
                    <li class="flex justify-between text-sm p-2 bg-orange-50/50 rounded-lg border border-orange-100">
                        <span class="text-slate-700">${p.name}</span>
                        <span class="font-bold text-slate-900">R$ ${parseFloat(p.value).toFixed(2)}</span>
                    </li>`;
            });
            html += `</ul>`;
        }

        // Lista de Serviços
        if (det.services_list && det.services_list.length > 0) {
            html += `<h4 class="font-bold text-slate-700 text-sm mb-2 flex items-center gap-2"><i class="ph-bold ph-wrench text-blue-500"></i> Serviços</h4>`;
            html += `<ul class="space-y-2 mb-4">`;
            det.services_list.forEach(s => {
                html += `
                    <li class="flex justify-between text-sm p-2 bg-blue-50/50 rounded-lg border border-blue-100">
                        <span class="text-slate-700">${s.name}</span>
                        <span class="font-bold text-slate-900">R$ ${parseFloat(s.value).toFixed(2)}</span>
                    </li>`;
            });
            html += `</ul>`;
        }
    } 
    // Se for Abastecimento
    else if (item.type === 'Abastecimento' || item.type === 'FUEL') {
        html += `
            <div class="bg-blue-50 p-4 rounded-xl border border-blue-100 space-y-2">
                <div class="flex justify-between">
                    <span class="text-sm text-slate-500">Litros</span>
                    <span class="font-bold text-slate-800">${item.liters} L</span>
                </div>
                <div class="flex justify-between">
                    <span class="text-sm text-slate-500">Preço/L</span>
                    <span class="font-bold text-slate-800">R$ ${item.price_per_liter || '-'}</span>
                </div>
                <div class="flex justify-between border-t border-blue-100 pt-2 mt-1">
                    <span class="text-sm text-slate-500">KM no Ato</span>
                    <span class="font-bold text-slate-800">${item.km_final || '-'}</span>
                </div>
            </div>
        `;
    }

    content.innerHTML = html;
    modal.classList.remove('hidden');

    document.body.classList.add('overflow-hidden');
}

function closeDetailsModal() {
    document.getElementById('detailsModal').classList.add('hidden');
    
    // CORREÇÃO DE SCROLL: Destrava o corpo do site
    // Só destrava se o modal de foto não estiver aberto (para evitar conflito)
    const photoModal = document.getElementById('photoModal');
    if (photoModal.classList.contains('hidden')) {
        document.body.classList.remove('overflow-hidden');
    }
}

// ==================================================================
// FUNÇÕES AUXILIARES (Gráficos, Fotos, Máscaras)
// ==================================================================

async function loadGlobalStats() {
    try {
        if (!currentUser) return;

        // 1. Busca todos os movimentos do banco (Rota que criamos no server.js)
        const res = await fetch(`${API_BASE_URL}/company/${currentUser.company_id}/all-movements`);
        if (!res.ok) throw new Error("Erro ao buscar estatísticas");
        
        const movements = await res.json();

        // 2. Filtra apenas os dados do Mês Atual
        const now = new Date();
        const currentMonth = now.getMonth(); // 0 a 11
        const currentYear = now.getFullYear();

        const monthlyMovs = movements.filter(m => {
            // Cria a data ajustando o fuso para evitar cair no mês anterior
            const parts = m.date.split('-'); // Espera YYYY-MM-DD
            const year = parseInt(parts[0]);
            const month = parseInt(parts[1]) - 1; // JS conta meses de 0 a 11
            return month === currentMonth && year === currentYear;
        });

        // 3. Calcula os Totais
        let totalLiters = 0;
        let totalCost = 0;
        let fuelCost = 0;
        let maintCost = 0;

        monthlyMovs.forEach(m => {
            const val = parseFloat(m.value) || 0;
            totalCost += val;

            // Verifica se é abastecimento (compatível com 'FUEL' antigo ou 'Abastecimento' novo)
            if (m.type === 'Abastecimento' || m.type === 'FUEL') {
                totalLiters += parseFloat(m.liters) || 0;
                fuelCost += val;
            } else {
                maintCost += val; // Manutenção
            }
        });

        // 4. Atualiza os números na tela
        const litEl = document.getElementById('totalLiters');
        const costEl = document.getElementById('totalCost');
        const dateEl = document.getElementById('headerDate');

        // Formata e exibe
        if (litEl) litEl.innerText = totalLiters.toFixed(1);
        if (costEl) costEl.innerText = `R$ ${totalCost.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
        
        // Atualiza a data no cabeçalho (Ex: "Janeiro 2026")
        if (dateEl) {
            const monthNames = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
            dateEl.innerText = `Resumo de ${monthNames[currentMonth]} ${currentYear}`;
        }

        // 5. Desenha o Gráfico
        renderChart(fuelCost, maintCost);

    } catch (e) {
        console.error("Erro Dashboard:", e);
    }
}

function renderChart(fuel, maintenance) {
    const ctx = document.getElementById('expenseChart');
    if (!ctx) return;

    // Se já existir um gráfico, destrói antes de criar outro (evita bugs visuais)
    if (expenseChart) {
        expenseChart.destroy();
    }

    // Se não houver dados, cria um gráfico vazio visual
    if (fuel === 0 && maintenance === 0) {
        fuel = 1; // Apenas para aparecer um círculo cinza
        maintenance = 0;
        var colors = ['#E2E8F0', '#E2E8F0'];
    } else {
        var colors = ['#2563EB', '#F59E0B']; // Azul (Combustível) e Laranja (Manutenção)
    }

    expenseChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Combustível', 'Manutenção'],
            datasets: [{
                data: [fuel, maintenance],
                backgroundColor: colors,
                borderWidth: 0,
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        usePointStyle: true,
                        font: { size: 12 }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            let label = context.label || '';
                            if (label) label += ': ';
                            if (context.parsed !== null) {
                                label += new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(context.parsed);
                            }
                            return label;
                        }
                    }
                }
            },
            cutout: '70%', // Deixa o gráfico mais fino e elegante
        }
    });
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
    // Impede a propagação se foi clicado de dentro de outro elemento
    if (event) event.stopPropagation();

    const modal = document.getElementById('photoModal');
    const img = document.getElementById('modalImage');
    
    if (modal && img) {
        img.src = src;
        modal.classList.remove('hidden');
        
        // Trava o scroll (garantia extra caso abra direto)
        document.body.classList.add('overflow-hidden');
    }
}

function closePhotoModal() {
    const modal = document.getElementById('photoModal');
    if (modal) modal.classList.add('hidden');

    // LÓGICA INTELIGENTE DE SCROLL:
    // Se o modal de Detalhes estiver aberto lá atrás, NÃO destrava o scroll do body.
    // Se o modal de Detalhes estiver fechado, aí sim destrava.
    const detailsModal = document.getElementById('detailsModal');
    
    // Se o detailsModal não existe ou está escondido, libera o scroll
    if (!detailsModal || detailsModal.classList.contains('hidden')) {
        document.body.classList.remove('overflow-hidden');
    }
    // Caso contrário (Detalhes aberto), mantém o overflow-hidden para o usuário continuar lendo o histórico sem o fundo mexer.
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