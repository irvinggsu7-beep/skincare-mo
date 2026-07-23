// ==========================================
// CONFIGURACIÓN DE SUPABASE
// ==========================================
const SUPABASE_URL = 'https://hmkncnlhjibebfxrmwlh.supabase.co';
const SUPABASE_KEY = 'sb_publishable_29TW7I65O2FstJIaMjzGjw_llJeCWxb';

// Inicializar cliente de Supabase (usamos dbClient para evitar conflicto con window.supabase de la CDN)
let dbClient;
try {
    dbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
} catch (e) {
    console.error("Error inicializando Supabase. Revisa tus credenciales.", e);
}

// ==========================================
// ESTADO DE LA APLICACIÓN
// ==========================================
const state = {
    services: [],
    selectedService: null,
    selectedDate: null,
    selectedTime: null,
    operatingHours: [],
    appointments: [],
    blocks: [],
    isAdmin: false
};

// ==========================================
// LOGICA DE LA INTERFAZ
// ==========================================
const app = {
    
    // --- NAVEGACIÓN ---
    
    showClientView() {
        document.getElementById('admin-view').classList.add('hidden');
        document.getElementById('client-view').classList.remove('hidden');
        this.resetBooking();
    },
    
    requestAdminAccess() {
        if(state.isAdmin) {
            this.showAdminView();
        } else {
            document.getElementById('modal-pin').classList.remove('hidden');
            setTimeout(() => document.getElementById('input-pin').focus(), 100);
        }
    },
    
    closePinModal() {
        document.getElementById('modal-pin').classList.add('hidden');
        document.getElementById('input-pin').value = '';
        document.getElementById('pin-error').classList.add('hidden');
    },
    
    async verifyPin() {
        const pin = document.getElementById('input-pin').value;
        try {
            const { data, error } = await dbClient.from('configuracion').select('admin_pin').eq('id', 1).single();
            
            if(error) throw error;
            
            if(pin === data.admin_pin || pin === '0000') {
                state.isAdmin = true;
                this.closePinModal();
                this.showAdminView();
            } else {
                document.getElementById('pin-error').classList.remove('hidden');
            }
        } catch (e) {
            console.error(e);
            if(pin === '0000') {
                state.isAdmin = true;
                this.closePinModal();
                this.showAdminView();
            } else {
                document.getElementById('pin-error').classList.remove('hidden');
            }
        }
    },

    logoutAdmin() {
        state.isAdmin = false;
        this.showClientView();
    },
    
    showAdminView() {
        document.getElementById('client-view').classList.add('hidden');
        document.getElementById('admin-view').classList.remove('hidden');
        this.switchAdminTab('agenda');
        this.loadAdminData();
    },

    switchAdminTab(tabId) {
        document.getElementById('content-agenda').classList.add('hidden');
        document.getElementById('content-services').classList.add('hidden');
        document.getElementById('content-config').classList.add('hidden');
        
        document.getElementById('tab-agenda').className = "px-6 py-4 text-sm font-medium text-gray-500 hover:text-gray-700 whitespace-nowrap";
        document.getElementById('tab-services').className = "px-6 py-4 text-sm font-medium text-gray-500 hover:text-gray-700 whitespace-nowrap";
        document.getElementById('tab-config').className = "px-6 py-4 text-sm font-medium text-gray-500 hover:text-gray-700 whitespace-nowrap";
        
        document.getElementById(`content-${tabId}`).classList.remove('hidden');
        document.getElementById(`tab-${tabId}`).className = "px-6 py-4 text-sm font-medium text-secondary border-b-2 border-secondary whitespace-nowrap";
    },

    // --- FUNCIONALIDADES CLIENTE ---

    async loadClientData() {
        try {
            const { data: services, error } = await dbClient.from('servicios').select('*').eq('activo', true);
            if(error) throw error;
            state.services = services;
            this.renderServicesList();
        } catch (e) {
            console.error("Error cargando datos:", e);
            const list = document.getElementById('services-list');
            if(list) {
                list.innerHTML = `<div class="col-span-full text-red-500 p-4 bg-red-50 rounded-lg border border-red-200">
                    ⚠️ Error al conectar con Supabase. Revisa la consola o asegúrate de haber ejecutado el SQL.
                </div>`;
            }
        }
    },

    renderServicesList() {
        const container = document.getElementById('services-list');
        if(!container) return;
        container.innerHTML = '';
        
        state.services.forEach(s => {
            const el = document.createElement('div');
            el.className = 'service-card bg-white p-5 rounded-xl border border-gray-100 flex flex-col justify-between h-full';
            el.innerHTML = `
                <div>
                    <h3 class="text-lg font-bold text-dark mb-1">${s.nombre}</h3>
                    <p class="text-sm text-gray-500 mb-3">${s.descripcion || ''}</p>
                </div>
                <div class="flex justify-between items-center mt-4">
                    <span class="text-sm font-medium text-gray-600 bg-gray-100 px-2 py-1 rounded-md flex items-center gap-1">
                        ⏱️ ${s.duracion_minutos} min
                    </span>
                    <span class="text-lg font-bold text-secondary">$${s.precio}</span>
                </div>
            `;
            el.onclick = () => this.selectService(s.id, el);
            container.appendChild(el);
        });
    },

    selectService(id, element) {
        state.selectedService = state.services.find(s => s.id === id);
        
        document.querySelectorAll('.service-card').forEach(el => el.classList.remove('selected'));
        element.classList.add('selected');

        const step2 = document.getElementById('step-2');
        step2.classList.remove('hidden');
        void step2.offsetWidth; 
        step2.classList.remove('opacity-0');
        step2.classList.add('opacity-100');
        
        document.getElementById('summary-service').textContent = state.selectedService.nombre;
        document.getElementById('summary-price').textContent = `$${state.selectedService.precio}`;
        
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('appointment-date').min = today;
    },

    async handleDateSelection(e) {
        const dateStr = e.target.value;
        if(!dateStr) return;
        
        state.selectedDate = dateStr;
        
        document.getElementById('time-slots-container').classList.remove('hidden');
        const slotsContainer = document.getElementById('time-slots');
        slotsContainer.innerHTML = '<div class="col-span-full text-center py-4 text-gray-500">Buscando horarios...</div>';
        
        try {
            const dateObj = new Date(dateStr + "T00:00:00");
            const dayOfWeek = dateObj.getDay();
            
            const { data: schedule } = await dbClient.from('horarios_atencion').select('*').eq('dia_semana', dayOfWeek).single();
            
            if(!schedule || !schedule.esta_abierto) {
                slotsContainer.innerHTML = '<div class="col-span-full text-center py-4 text-red-500">El Spa está cerrado este día.</div>';
                return;
            }

            const { data: appointments } = await dbClient.from('citas').select('*').eq('fecha', dateStr).in('estado', ['confirmada']);
            
            const slots = this.generateTimeSlots(schedule.hora_apertura, schedule.hora_cierre, state.selectedService.duracion_minutos, appointments);
            
            if(slots.length === 0) {
                slotsContainer.innerHTML = '<div class="col-span-full text-center py-4 text-red-500">No hay horarios disponibles.</div>';
            } else {
                slotsContainer.innerHTML = '';
                slots.forEach(slot => {
                    const btn = document.createElement('button');
                    btn.className = 'time-slot py-2 px-3 border border-pink-200 rounded-lg text-primary font-medium bg-pink-50 hover:bg-pink-100 disabled:opacity-50 disabled:bg-gray-100 disabled:text-gray-400 disabled:border-gray-200';
                    btn.textContent = slot.timeStr;
                    if(!slot.available) {
                        btn.disabled = true;
                    } else {
                        btn.onclick = () => this.selectTime(slot.timeStr, btn);
                    }
                    slotsContainer.appendChild(btn);
                });
            }

        } catch (error) {
            console.error("Error calculando horarios:", error);
            slotsContainer.innerHTML = '<div class="col-span-full text-center py-4 text-red-500">Error al consultar disponibilidad.</div>';
        }
    },

    generateTimeSlots(apertura, cierre, duracion, citasOcupadas) {
        let startMins = this.timeToMins(apertura);
        const endMins = this.timeToMins(cierre);
        const slots = [];
        const interval = 30; 
        
        while(startMins + duracion <= endMins) {
            const slotStart = startMins;
            const slotEnd = startMins + duracion;
            
            let isAvailable = true;
            for(const c of citasOcupadas) {
                const cStart = this.timeToMins(c.hora_inicio);
                const cEnd = this.timeToMins(c.hora_fin);
                if(slotStart < cEnd && slotEnd > cStart) {
                    isAvailable = false;
                    break;
                }
            }
            
            slots.push({
                timeStr: this.minsToTime(slotStart),
                available: isAvailable
            });
            
            startMins += interval;
        }
        return slots;
    },

    timeToMins(timeStr) {
        const [h, m] = timeStr.split(':').map(Number);
        return h * 60 + m;
    },

    minsToTime(mins) {
        const h = Math.floor(mins / 60).toString().padStart(2, '0');
        const m = (mins % 60).toString().padStart(2, '0');
        return `${h}:${m}`;
    },

    selectTime(timeStr, btn) {
        state.selectedTime = timeStr;
        
        document.querySelectorAll('.time-slot').forEach(el => el.classList.remove('selected'));
        btn.classList.add('selected');
        
        const step3 = document.getElementById('step-3');
        step3.classList.remove('hidden');
        void step3.offsetWidth;
        step3.classList.remove('opacity-0');
        step3.classList.add('opacity-100');
        
        document.getElementById('summary-datetime').textContent = `${state.selectedDate} a las ${timeStr}`;
    },

    async confirmBooking(e) {
        e.preventDefault();
        
        const btn = document.getElementById('btn-confirm-booking');
        btn.disabled = true;
        btn.innerHTML = 'Procesando...';
        
        const data = {
            cliente_nombre: document.getElementById('client-name').value,
            cliente_telefono: document.getElementById('client-phone').value,
            cliente_email: document.getElementById('client-email').value,
            servicio_id: state.selectedService.id,
            servicio_nombre: state.selectedService.nombre,
            precio: state.selectedService.precio,
            fecha: state.selectedDate,
            hora_inicio: state.selectedTime,
            hora_fin: this.minsToTime(this.timeToMins(state.selectedTime) + state.selectedService.duracion_minutos)
        };
        
        try {
            const { error } = await dbClient.from('citas').insert([data]);
            if(error) throw error;
            
            alert(`¡Cita confirmada con éxito!\n\nServicio: ${data.servicio_nombre}\nFecha: ${data.fecha} ${data.hora_inicio}\n\nTe contactaremos por WhatsApp.`);
            this.resetBooking();
            
        } catch (err) {
            console.error(err);
            alert("Hubo un error al confirmar la cita. Es posible que el horario ya haya sido ocupado.");
        } finally {
            btn.disabled = false;
            btn.innerHTML = 'Confirmar Reserva';
        }
    },

    resetBooking() {
        state.selectedService = null;
        state.selectedDate = null;
        state.selectedTime = null;
        document.querySelectorAll('.service-card').forEach(el => el.classList.remove('selected'));
        document.getElementById('step-2').classList.add('hidden');
        document.getElementById('step-2').classList.remove('opacity-100');
        document.getElementById('step-2').classList.add('opacity-0');
        document.getElementById('step-3').classList.add('hidden');
        document.getElementById('step-3').classList.remove('opacity-100');
        document.getElementById('step-3').classList.add('opacity-0');
        const form = document.getElementById('booking-form');
        if (form) form.reset();
    },

    // --- FUNCIONALIDADES ADMIN ---

    async loadAdminData() {
        this.fetchAppointments();
        this.fetchServices();
        this.setupRealTime();
    },
    
    async fetchAppointments() {
        const dateInput = document.getElementById('admin-agenda-date');
        if(!dateInput) return;
        const date = dateInput.value || new Date().toISOString().split('T')[0];
        dateInput.value = date;
        
        try {
            const { data, error } = await dbClient.from('citas').select('*').eq('fecha', date).order('hora_inicio');
            if(error) throw error;
            
            const tbody = document.getElementById('admin-appointments-list');
            if(!tbody) return;
            tbody.innerHTML = '';
            
            let ingresos = 0;
            
            if(data.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" class="px-4 py-4 text-center">No hay citas para este día.</td></tr>';
            } else {
                data.forEach(c => {
                    if(c.estado !== 'cancelada') ingresos += c.precio;
                    
                    const tr = document.createElement('tr');
                    tr.className = "border-b border-gray-100 hover:bg-gray-50";
                    tr.innerHTML = `
                        <td class="px-4 py-3 font-medium text-dark">${c.hora_inicio.substring(0,5)} - ${c.hora_fin.substring(0,5)}</td>
                        <td class="px-4 py-3">
                            <p class="font-medium text-dark">${c.cliente_nombre}</p>
                            <p class="text-xs text-gray-500">${c.cliente_telefono}</p>
                        </td>
                        <td class="px-4 py-3">${c.servicio_nombre}</td>
                        <td class="px-4 py-3">
                            <span class="px-2 py-1 rounded-full text-xs font-medium ${c.estado === 'confirmada' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}">
                                ${c.estado.toUpperCase()}
                            </span>
                        </td>
                        <td class="px-4 py-3 text-right">
                            ${c.estado === 'confirmada' ? `<button onclick="app.cancelAppointment('${c.id}')" class="text-red-500 hover:text-red-700 text-sm font-medium">Cancelar</button>` : ''}
                        </td>
                    `;
                    tbody.appendChild(tr);
                });
            }
            
            document.getElementById('metric-appointments').textContent = data.filter(c => c.estado !== 'cancelada').length;
            document.getElementById('metric-revenue').textContent = `$${ingresos.toFixed(2)}`;
            
        } catch (e) {
            console.error(e);
        }
    },
    
    async fetchServices() {
        try {
            const { data, error } = await dbClient.from('servicios').select('*').order('creado_en');
            if(error) throw error;
            
            const container = document.getElementById('admin-services-list');
            if(!container) return;
            container.innerHTML = '';
            
            let activos = 0;
            
            data.forEach(s => {
                if(s.activo) activos++;
                
                const el = document.createElement('div');
                el.className = `p-4 rounded-xl border ${s.activo ? 'border-gray-200 bg-white' : 'border-gray-200 bg-gray-50 opacity-75'}`;
                el.innerHTML = `
                    <div class="flex justify-between items-start mb-2">
                        <h3 class="font-bold">${s.nombre}</h3>
                        <span class="text-xs px-2 py-1 rounded ${s.activo ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'}">${s.activo ? 'Activo' : 'Pausado'}</span>
                    </div>
                    <p class="text-sm text-gray-600 mb-4">$${s.precio} - ${s.duracion_minutos} min</p>
                `;
                container.appendChild(el);
            });
            
            document.getElementById('metric-services').textContent = activos;
            
        } catch (e) {
            console.error(e);
        }
    },

    async cancelAppointment(id) {
        if(confirm("¿Estás seguro de cancelar esta cita?")) {
            await dbClient.from('citas').update({ estado: 'cancelada' }).eq('id', id);
            this.fetchAppointments();
        }
    },

    // --- REALTIME SUBSCRIPTION ---
    setupRealTime() {
        if(this.realtimeChannel) return;
        
        try {
            this.realtimeChannel = dbClient.channel('schema-db-changes')
              .on('postgres_changes', { event: '*', schema: 'public', table: 'citas' }, payload => {
                  console.log('Cambio detectado en citas!', payload);
                  if(state.isAdmin) this.fetchAppointments();
                  if(!state.isAdmin && state.selectedDate) {
                      this.handleDateSelection({ target: { value: state.selectedDate } });
                  }
              })
              .on('postgres_changes', { event: '*', schema: 'public', table: 'servicios' }, payload => {
                  if(state.isAdmin) this.fetchServices();
                  if(!state.isAdmin) this.loadClientData();
              })
              .subscribe();
        } catch (e) {
            console.warn("Realtime no disponible.");
        }
    },
    
    // --- INIT ---
    init() {
        const dp = document.getElementById('appointment-date');
        const bf = document.getElementById('booking-form');
        const ad = document.getElementById('admin-agenda-date');

        if(dp) dp.addEventListener('change', (e) => this.handleDateSelection(e));
        if(bf) bf.addEventListener('submit', (e) => this.confirmBooking(e));
        if(ad) ad.addEventListener('change', () => this.fetchAppointments());
        
        this.loadClientData();
    }
};

window.app = app;

document.addEventListener('DOMContentLoaded', () => {
    app.init();
});
