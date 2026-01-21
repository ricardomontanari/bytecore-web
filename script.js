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
let currentDetailId = null;
let currentFilterDays = 30;
let currentFilterPlate = 'all';

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
        if (!currentUser) return;
        const r = await fetch(`${API_BASE_URL}/company/${currentUser.company_id}/vehicles`);
        const data = await r.json();

        // Cria as opções
        const optsFilter = '<option value="all">Todos os Veículos</option>' + 
                           data.map(v => `<option value="${v.plate}">${v.plate} - ${v.model}</option>`).join('');
        
        const optsForm = '<option value="">Selecione...</option>' + 
                         data.map(v => `<option value="${v.plate}">${v.plate} - ${v.model}</option>`).join('');

        // IDs dos elementos que são Filtros
        ['globalVehicleFilter', 'searchPlateHistory', 'searchPlateTrips'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = optsFilter;
        });

        // IDs dos elementos que são Formulários (Lançamento)
        ['gPlate', 'mPlate', 'closeTripVehicle'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = optsForm;
        });

    } catch (e) { console.error(e); }
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

        // LÓGICA DE FILTRO CLIENT-SIDE
        const filterVal = document.getElementById('searchPlateHistory')?.value;
        if (filterVal && filterVal !== 'all') {
            movements = movements.filter(m => m.plate === filterVal);
        }

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

    const elPlate = document.getElementById('closeTripVehicle');
    const elKm = document.getElementById('closeTripKmFinal');
    const elToll = document.getElementById('closeTripToll');
    const elDate = document.getElementById('tripEndDate');

    if (!elPlate) return console.error("Erro: Campo 'closeTripVehicle' não encontrado no HTML");
    if (!elKm) return console.error("Erro: Campo 'closeTripKmFinal' não encontrado no HTML");
    if (!elToll) return console.error("Erro: Campo 'closeTripToll' não encontrado no HTML");
    if (!elDate) return console.error("Erro: Campo 'tripEndDate' não encontrado no HTML");

    const plate = elPlate.value;
    const end_km = elKm.value;
    const toll_cost = elToll.value;
    const tripDate = elDate.value;

    if (!plate || !end_km) return alert("Preencha a Placa e o KM Final!");

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
                date: tripDate // Envia a data correta
            })
        });

        const result = await response.json();

        if (response.ok) {
            alert("✅ Viagem Fechada!\n" + 
                  "Lucro: R$ " + parseFloat(result.data.net_profit).toFixed(2) + "\n" +
                  "Média: " + result.data.average_consumption + " KM/L");
            
            // Limpar campos
            elKm.value = '';
            elToll.value = '';
            
            // Atualizar Dashboard e Histórico
            loadSystem(); 
            switchTab('dashboard'); // Volta para o início
        } else {
            alert("Erro: " + result.error);
        }
    } catch (error) {
        console.error(error);
        alert("Falha na conexão com o servidor.");
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

// Dados do Dashboard
async function updateDashboardSummary() {
    if (!currentUser) return;

    // Efeito de carregamento
    const elProfit = document.getElementById('monthlyProfitDisplay');
    if(elProfit) elProfit.innerText = "...";

    try {
        const url = `${API_BASE_URL}/company/${currentUser.company_id}/dashboard-summary?days=${currentFilterDays}&plate=${currentFilterPlate}`;
        const response = await fetch(url);
        const data = await response.json();

        const btcCurrency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

        // Atualiza na tela (com Labels atualizadas se você mudou no HTML)
        // NOTA: No HTML, sugiro mudar o texto "Despesas" para "Custos de Viagem" para ficar claro
        if (document.getElementById('monthlyProfitDisplay')) 
            document.getElementById('monthlyProfitDisplay').innerText = btcCurrency.format(data.total_profit || 0);
        
        if (document.getElementById('monthlyRevenueDisplay')) 
            document.getElementById('monthlyRevenueDisplay').innerText = btcCurrency.format(data.total_revenue || 0);
        
        if (document.getElementById('monthlyExpensesDisplay')) 
            document.getElementById('monthlyExpensesDisplay').innerText = btcCurrency.format(data.total_custo_viagem || 0);

    } catch (error) {
        console.error("Erro dashboard:", error);
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

        // LÓGICA DE FILTRO CLIENT-SIDE
        const filterVal = document.getElementById('searchPlateTrips')?.value;
        if (filterVal && filterVal !== 'all') {
            trips = trips.filter(t => t.plate === filterVal);
        }

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

    currentDetailId = item.id; // Salva o ID para usar no Delete/Edit

    const modal = document.getElementById('detailsModal');
    const title = document.getElementById('detTitle');
    const sub = document.getElementById('detSubtitle');
    const content = document.getElementById('detContent');
    
    // Tratamento de Data para os Inputs (YYYY-MM-DD)
    const dateObj = new Date(item.date);
    const dateInputFmt = dateObj.toISOString().split('T')[0];
    const dateDisplayFmt = dateObj.toLocaleDateString('pt-BR', { timeZone: 'UTC' });

    // 1. Cabeçalho
    title.innerText = item.type;
    sub.innerHTML = `
        <div id="viewHeader">
            ${item.plate} • ${dateDisplayFmt}
        </div>
        <div id="editHeader" class="hidden gap-2 mt-2">
            <input type="date" id="editDate" value="${dateInputFmt}" class="p-2 border rounded bg-white text-xs w-full">
        </div>
    `;

    // 2. Rodapé com Botões de Ação
    // Vamos injetar o HTML do rodapé dinamicamente para incluir o valor editável
    const footerDiv = modal.querySelector('.border-t'); // Seleciona a div do rodapé
    footerDiv.innerHTML = `
        <div class="flex justify-between items-center mb-4">
            <span class="text-sm font-bold text-slate-500 uppercase">Total Geral</span>
            
            <span class="text-xl font-bold text-blue-600" id="detTotalDisplay">
                R$ ${parseFloat(item.value).toFixed(2)}
            </span>
            
            <input type="number" id="editTotal" value="${item.value}" class="hidden w-32 p-2 border rounded font-bold text-blue-600 text-right">
        </div>

        <div id="actionButtons" class="grid grid-cols-2 gap-3">
            <button onclick="deleteMovement()" class="bg-red-50 text-red-600 py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-red-100">
                <i class="ph-bold ph-trash"></i> Excluir
            </button>
            <button onclick="enableEditMode()" class="bg-blue-50 text-blue-600 py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-blue-100">
                <i class="ph-bold ph-pencil-simple"></i> Editar
            </button>
        </div>

        <div id="saveButtons" class="hidden grid grid-cols-2 gap-3">
             <button onclick="closeDetailsModal()" class="bg-slate-200 text-slate-600 py-3 rounded-xl font-bold">
                Cancelar
            </button>
            <button onclick="saveMovementChanges()" class="bg-green-600 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-green-200">
                <i class="ph-bold ph-check"></i> Salvar
            </button>
        </div>
    `;

    // 3. Conteúdo Central (Mantivemos a lógica de visualização, mas adicionamos IDs para edição)
    let html = '';
    
    // Foto
    if (item.receipt_image) {
        html += `<div class="mb-4 text-center"><button onclick="openPhotoModal('${item.receipt_image}')" class="text-xs text-blue-500 underline">Ver Comprovante Anexado</button></div>`;
    }

    // Campos Editáveis de KM e Litros
    // Se for Abastecimento
    if (item.type === 'Abastecimento' || item.type === 'FUEL') {
        html += `
            <div class="grid grid-cols-2 gap-3 bg-blue-50 p-3 rounded-xl border border-blue-100">
                <div>
                    <p class="text-[10px] text-slate-400 uppercase">Litros</p>
                    <input id="editLiters" type="number" value="${item.liters}" disabled class="bg-transparent font-bold text-slate-800 w-full outline-none disabled:opacity-100">
                </div>
                <div>
                    <p class="text-[10px] text-slate-400 uppercase">Preço/L</p>
                    <input id="editPrice" type="number" value="${item.price_per_liter}" disabled class="bg-transparent font-bold text-slate-800 w-full outline-none disabled:opacity-100">
                </div>
            </div>
        `;
    }
    
    // KM (Comum a todos)
    html += `
        <div class="mt-4 bg-slate-50 p-3 rounded-xl border border-slate-100">
             <p class="text-[10px] text-slate-400 uppercase">KM Registrado</p>
             <input id="editKm" type="number" value="${item.km_initial || item.km_final || 0}" disabled class="bg-transparent font-bold text-slate-700 w-full outline-none border-b border-transparent focus:border-blue-500 transition-colors">
        </div>
        <p class="text-[10px] text-slate-400 mt-2 italic text-center">* Para alterar listas de peças, exclua e refaça o lançamento.</p>
    `;

    content.innerHTML = html;
    
    // Abre o modal e trava scroll
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

async function registerUserByManager() {
    const name = document.getElementById('newUserName').value;
    const email = document.getElementById('newUserEmail').value;
    const password = document.getElementById('newUserPass').value;
    const role = document.getElementById('newUserRole').value;

    if (!name || !email || !password) return alert("Preencha todos os campos!");

    try {
        const r = await fetch(`${API_BASE_URL}/company/${currentUser.company_id}/users`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email, password, role })
        });

        if (r.ok) {
            alert("Usuário criado com sucesso!");
            // Limpa campos
            document.getElementById('newUserName').value = "";
            document.getElementById('newUserEmail').value = "";
            document.getElementById('newUserPass').value = "";
            
            toggleAccordion('formNewUser'); // Fecha o form
            loadCompanyUsers(); // Recarrega a lista
        } else {
            const err = await r.json();
            alert("Erro: " + err.error);
        }
    } catch (e) { console.error(e); }
}

// --- FUNÇÕES DE SUPER ADMIN (IMPLANTAÇÃO) ---

function toggleAdminPanel() {
    const panel = document.getElementById('adminPanel');
    if (panel.classList.contains('hidden')) {
        panel.classList.remove('hidden');
    } else {
        panel.classList.add('hidden');
    }
}

async function runImplementation() {
    // Coleta dados
    const key = document.getElementById('admKey').value;
    const cName = document.getElementById('admCompName').value;
    const cDomain = document.getElementById('admCompDomain').value;
    const mName = document.getElementById('admManName').value;
    const mEmail = document.getElementById('admManEmail').value;
    const mPass = document.getElementById('admManPass').value;

    if (!key || !cName || !cDomain || !mName || !mEmail || !mPass) {
        return alert("Preencha TODOS os campos para implantar.");
    }

    const btn = event.currentTarget;
    const oldText = btn.innerHTML;
    btn.innerHTML = "Processando...";
    btn.disabled = true;

    try {
        const res = await fetch(`${API_BASE_URL}/admin/setup-company`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                admin_key: key,
                company_name: cName,
                company_domain: cDomain,
                manager_name: mName,
                manager_email: mEmail,
                manager_password: mPass
            })
        });

        const data = await res.json();

        if (res.ok) {
            alert(`✅ SUCESSO!\n\n${data.message}\n\nEntregue o login ao cliente:\nEmail: ${mEmail}\nSenha: ${mPass}`);
            toggleAdminPanel();
            // Limpa formulário
            document.getElementById('admCompName').value = "";
            document.getElementById('admCompDomain').value = "";
            document.getElementById('admManName').value = "";
            document.getElementById('admManEmail').value = "";
            document.getElementById('admManPass').value = "";
        } else {
            alert("Erro na implantação: " + data.error);
        }

    } catch (e) {
        console.error(e);
        alert("Erro de conexão com o servidor.");
    } finally {
        btn.innerHTML = oldText;
        btn.disabled = false;
    }
}

// 1. Ação dos Botões de Período
function setFilterPeriod(days, btnElement) {
    currentFilterDays = days;
    
    // Atualiza estilo dos botões
    document.querySelectorAll('.filter-period-btn').forEach(btn => {
        btn.classList.remove('bg-white', 'text-blue-600', 'shadow-sm');
        btn.classList.add('text-slate-500');
    });
    
    // Ativa o botão clicado
    btnElement.classList.add('bg-white', 'text-blue-600', 'shadow-sm');
    btnElement.classList.remove('text-slate-500');

    // Atualiza os dados
    updateDashboardSummary();
}

// 2. Ação do Select de Veículo Global
function applyGlobalFilters() {
    currentFilterPlate = document.getElementById('globalVehicleFilter').value;
    updateDashboardSummary(); // Atualiza os números de lucro
    // Opcional: loadGlobalStats(); // Se quiser filtrar o gráfico de pizza também
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

// --- FUNÇÃO DE COMPRESSÃO DE IMAGEM ---

function compressImage(file, maxWidth, quality, callback) {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = function(event) {
        const img = new Image();
        img.src = event.target.result;
        
        img.onload = function() {
            // Cria um canvas para desenhar a imagem menor
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;

            // Calcula novas dimensões mantendo a proporção
            if (width > maxWidth) {
                height = Math.round((height * maxWidth) / width);
                width = maxWidth;
            }

            canvas.width = width;
            canvas.height = height;

            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);

            // Converte para Base64 comprimido (JPEG com qualidade 0.7)
            // Isso reduz uma foto de 5MB para ~100kb
            const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
            callback(compressedDataUrl);
        };
    };
}

// --- FUNÇÃO ATUALIZADA DE CAPTURA ---

function handlePhoto(input) {
    if (input.files && input.files[0]) {
        const file = input.files[0];
        
        // Feedback visual imediato (enquanto processa)
        const preview = document.getElementById('receiptPhoto');
        if (preview) {
            preview.classList.remove('hidden');
            preview.style.opacity = '0.5'; // Deixa meio transparente indicando carregamento
        }

        // Chama a compressão: Max 1024px largura, Qualidade 70%
        compressImage(file, 1024, 0.7, function(compressedResult) {
            base64Photo = compressedResult; // Salva a versão leve
            
            // Atualiza preview com a imagem final
            if (preview) {
                preview.style.backgroundImage = `url(${base64Photo})`;
                preview.style.opacity = '1';
            }
        });
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

// 1. Função de Excluir
async function deleteMovement() {
    if (!currentDetailId) return;

    if (confirm("Tem certeza que deseja EXCLUIR este registo? Esta ação não pode ser desfeita.")) {
        try {
            const res = await fetch(`${API_BASE_URL}/movements/${currentDetailId}`, {
                method: 'DELETE'
            });

            if (res.ok) {
                alert("Registo apagado!");
                closeDetailsModal();
                loadHistory();      // Atualiza lista
                loadGlobalStats();  // Atualiza gráfico
            } else {
                alert("Erro ao excluir.");
            }
        } catch (e) {
            console.error(e);
            alert("Erro de conexão.");
        }
    }
}

// 2. Ativar Modo de Edição
function enableEditMode() {
    // Esconde cabeçalho visual e mostra input de data
    document.getElementById('viewHeader').classList.add('hidden');
    document.getElementById('editHeader').classList.remove('hidden');
    document.getElementById('editHeader').classList.add('flex');

    // Troca display de valor por input
    document.getElementById('detTotalDisplay').classList.add('hidden');
    document.getElementById('editTotal').classList.remove('hidden');

    // Troca botões de ação pelos de salvar
    document.getElementById('actionButtons').classList.add('hidden');
    document.getElementById('saveButtons').classList.remove('hidden');
    document.getElementById('saveButtons').classList.add('grid');

    // Habilita inputs que estavam disabled
    const inputs = ['editKm', 'editLiters', 'editPrice'];
    inputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.disabled = false;
            el.classList.add('bg-white', 'border', 'border-slate-300', 'p-1', 'rounded'); // Dá estilo de input editável
        }
    });
}

// 3. Salvar Edição
async function saveMovementChanges() {
    if (!currentDetailId) return;

    const date = document.getElementById('editDate').value;
    const val = document.getElementById('editTotal').value;
    
    // Captura opcionais (se existirem na tela)
    const kmEl = document.getElementById('editKm');
    const litEl = document.getElementById('editLiters');
    const priceEl = document.getElementById('editPrice');

    const payload = {
        date: date,
        value: parseFloat(val),
        km_initial: kmEl ? parseInt(kmEl.value) : 0,
        km_final: kmEl ? parseInt(kmEl.value) : 0, // Simplificação: assume update no KM principal
        liters: litEl ? parseFloat(litEl.value) : null,
        price_per_liter: priceEl ? parseFloat(priceEl.value) : null
    };

    try {
        const res = await fetch(`${API_BASE_URL}/movements/${currentDetailId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            alert("Registo atualizado!");
            closeDetailsModal();
            loadHistory();
            loadGlobalStats();
        } else {
            alert("Erro ao atualizar.");
        }
    } catch (e) {
        console.error(e);
    }
}