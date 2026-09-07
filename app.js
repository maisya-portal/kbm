document.addEventListener('DOMContentLoaded', () => {
  const loadingEl = document.getElementById('global-loading');
  const contentArea = document.getElementById('contentArea');
  const btnLoad = document.getElementById('btn-load-data');
  const selGuru = document.getElementById('select-guru');
  const selMapel = document.getElementById('select-mapel');
  const selKelas = document.getElementById('select-kelas');
  const selJam = document.getElementById('select-jam');
  
  // Dummy Santri Data
  const dummySantri = [
    { id: 'S01', nama: 'Abdullah Azzam' },
    { id: 'S02', nama: 'Fulan bin Fulan' },
    { id: 'S03', nama: 'Hasan Al-Bashri' },
    { id: 'S04', nama: 'Umar Al-Faruq' },
    { id: 'S05', nama: 'Zaid bin Tsabit' },
    { id: 'S06', nama: 'Khalid bin Walid' },
    { id: 'S07', nama: 'Tariq bin Ziyad' },
    { id: 'S08', nama: 'Salahuddin Al-Ayyubi' }
  ];

  // Helper Loading
  function showLoading(show) {
    if(show) loadingEl.classList.remove('d-none');
    else loadingEl.classList.add('d-none');
  }

  // Helper Format Tanggal Indonesia: "Hari, DD Bulan YYYY" (Contoh: "Kamis, 20 Agustus 2026")
  function formatIndoDate(dateInput) {
    if (!dateInput && dateInput !== 0) return '-';
    var d;
    if (dateInput instanceof Date) {
      d = dateInput;
    } else {
      var str = String(dateInput).trim();
      if (!str || str === '-' || str === 'undefined' || str === 'null') return '-';
      var match = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
      if (match) {
        d = new Date(parseInt(match[1], 10), parseInt(match[2], 10) - 1, parseInt(match[3], 10));
      } else {
        d = new Date(str);
      }
    }
    if (isNaN(d.getTime())) return String(dateInput);
    var days = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
    var months = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
    return days[d.getDay()] + ', ' + d.getDate() + ' ' + months[d.getMonth()] + ' ' + d.getFullYear();
  }

  // GAS API URL
  const GAS_URL = "https://script.google.com/macros/s/AKfycbxWjwlc6-mXpOimodZMFvQIC8hwdGRAz78PqnYIfQgSuXKkI9fUP4hXfC5x3QUIypiT/exec?action=get_jadwal_kbm";
  let allJadwal = [];
  let allMapel = [];
  let allSantri = [];
  let allStaff = [];
  let activeJadwalIds = [];
  let progressInterval = null;
  let jamMasukTime = null;
  
  // State for clock out context
  let activeClockIn = null;

  // Init Data from Server
  async function initData() {
    showLoading(true);
    selGuru.innerHTML = '<option value="" selected disabled>-- Memuat Data... --</option>';
    try {
      const response = await fetch(GAS_URL);
      const res = await response.json();
      if(res.success) {
        allJadwal = res.jadwal || [];
        allMapel = res.mapel || [];
        allSantri = res.santri || [];
        allStaff = res.staff || [];
        activeJadwalIds = res.active_jadwal || [];


        populateGuruDropdown(allStaff, allJadwal);
        renderDashboard(); // Render the dashboard after data is loaded
        
        // Simpan cache master data untuk pemulihan cepat
        try {
          localStorage.setItem('maisya_kbm_master_cache', JSON.stringify({
            allJadwal, allMapel, allSantri, allStaff, activeJadwalIds,
            savedAt: new Date().toISOString()
          }));
        } catch(e) {}

        // Restore active session if available
        restoreSessionState();
      } else {
        Swal.fire('Error', 'Gagal memuat data jadwal dari server.', 'error');
      }
    } catch (e) {
      console.error(e);
      // Coba pulihkan dari master cache lokal jika fetch gagal
      let loadedFromCache = false;
      try {
        const cached = localStorage.getItem('maisya_kbm_master_cache');
        if (cached) {
          const parsed = JSON.parse(cached);
          if (parsed && parsed.allJadwal && parsed.allJadwal.length > 0) {
            allJadwal = parsed.allJadwal || [];
            allMapel = parsed.allMapel || [];
            allSantri = parsed.allSantri || [];
            allStaff = parsed.allStaff || [];
            activeJadwalIds = parsed.activeJadwalIds || [];
            populateGuruDropdown(allStaff, allJadwal);
            renderDashboard();
            restoreSessionState();
            loadedFromCache = true;
          }
        }
      } catch(eCache) {}

      if (!loadedFromCache) {
        Swal.fire('Offline', 'Tidak dapat terhubung ke server (Offline Mode). Data jadwal tidak dapat dimuat.', 'warning');
        selGuru.innerHTML = '<option value="" selected disabled>-- Offline --</option>';
      }
    }
    showLoading(false);
  }

  function populateGuruDropdown(staffList, jadwals) {
    selGuru.innerHTML = '<option value="" selected disabled>-- Pilih Guru --</option>';
    
    // Get unique staff IDs that exist in jadwal to only show teachers who have schedules
    const guruWithJadwal = [...new Set(jadwals.map(j => j.ID_Staff))];
    
    // Map to objects so we can sort alphabetically
    const guruData = guruWithJadwal.map(idStaff => {
      const st = (staffList || []).find(s => s.ID_Staff === idStaff);
      let nama = st ? st.Nama_Lengkap : (jadwals.find(j => j.ID_Staff === idStaff).Nama_Guru || idStaff);
      
      // Ensure nama is a string and trim it to avoid sorting issues with spaces
      nama = String(nama || '').trim();
      if (!nama) nama = String(idStaff).trim();

      return { idStaff, nama };
    });

    // Sort alphabetically by name (case-insensitive)
    guruData.sort((a, b) => a.nama.localeCompare(b.nama, 'id', { sensitivity: 'base' }));

    // Append sorted options to select
    guruData.forEach(item => {
      const opt = document.createElement('option');
      opt.value = item.idStaff;
      opt.innerText = item.nama;
      selGuru.appendChild(opt);
    });
  }

  // Helper function to format time correctly from sheet dates
  function formatTime(timeStr) {
    if(!timeStr) return "";
    if(String(timeStr).includes("1899-12-30") || String(timeStr).includes("T")) {
      try {
        const d = new Date(timeStr);
        return String(d.getHours()).padStart(2, '0') + ":" + String(d.getMinutes()).padStart(2, '0');
      } catch(e) {}
    }
    // If it's something like "11.00"
    return String(timeStr).replace(".", ":").substring(0,5);
  }

  // Dashboard Rendering
  function renderDashboard() {
    const tbody = document.getElementById('body-jadwal-dashboard');
    if (!tbody) return;

    if (allJadwal.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="text-center py-5 text-muted">Jadwal tidak tersedia</td></tr>';
      return;
    }

    // Populate filter dropdowns
    const uniqueKelas = [...new Set(allJadwal.map(j => j.Kelas))].filter(Boolean).sort((a, b) => {
      const numA = parseInt(String(a).match(/\d+/)?.[0] || 0);
      const numB = parseInt(String(b).match(/\d+/)?.[0] || 0);
      return numA - numB;
    });
    
    const filterKelas = document.getElementById('filter-kelas');
    if (filterKelas) {
      filterKelas.innerHTML = '<option value="Semua Kelas">Semua Kelas</option>';
      uniqueKelas.forEach(k => {
        filterKelas.innerHTML += `<option value="${k}">${k}</option>`;
      });
    }

    // Populate filter guru dropdown
    const filterGuru = document.getElementById('filter-guru');
    if (filterGuru) {
      filterGuru.innerHTML = '<option value="Semua Guru">Semua Guru</option>';
      const guruWithJadwal = [...new Set(allJadwal.map(j => j.ID_Staff))].filter(Boolean);
      const guruData = guruWithJadwal.map(idStaff => {
        const st = (allStaff || []).find(s => s.ID_Staff === idStaff);
        let nama = st ? st.Nama_Lengkap : (allJadwal.find(j => j.ID_Staff === idStaff)?.Nama_Guru || idStaff);
        nama = String(nama || '').trim();
        if (!nama) nama = String(idStaff).trim();
        return { idStaff, nama };
      });
      guruData.sort((a, b) => a.nama.localeCompare(b.nama, 'id', { sensitivity: 'base' }));
      guruData.forEach(g => {
        filterGuru.innerHTML += `<option value="${g.idStaff}">${g.nama}</option>`;
      });
    }

    const filterHari = document.getElementById('filter-hari');
    const filterJam = document.getElementById('filter-jam');
    
    // Set default hari to today
    if(filterHari) {
      const days = ['Ahad', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
      const today = days[new Date().getDay()];
      for (let i = 0; i < filterHari.options.length; i++) {
        if (filterHari.options[i].value.toLowerCase() === today.toLowerCase()) {
          filterHari.value = filterHari.options[i].value;
          break;
        }
      }
    }
    
    if(filterHari) filterHari.addEventListener('change', drawDashboardTable);
    if(filterJam) filterJam.addEventListener('change', drawDashboardTable);
    if(filterKelas) filterKelas.addEventListener('change', drawDashboardTable);
    if(filterGuru) filterGuru.addEventListener('change', drawDashboardTable);

    // Initial draw
    drawDashboardTable();
  }

  function drawDashboardTable() {
    const tbody = document.getElementById('body-jadwal-dashboard');
    if (!tbody) return;

    const filterHariVal = document.getElementById('filter-hari') ? document.getElementById('filter-hari').value : 'Semua Hari';
    const filterJamVal = document.getElementById('filter-jam') ? document.getElementById('filter-jam').value : 'Semua Jam';
    const filterKelasVal = document.getElementById('filter-kelas') ? document.getElementById('filter-kelas').value : 'Semua Kelas';
    const filterGuruVal = document.getElementById('filter-guru') ? document.getElementById('filter-guru').value : 'Semua Guru';

    let filtered = allJadwal;

    if (filterHariVal !== 'Semua Hari') {
      filtered = filtered.filter(j => String(j.Hari).toLowerCase() === String(filterHariVal).toLowerCase());
    }
    
    if (filterKelasVal !== 'Semua Kelas') {
      filtered = filtered.filter(j => String(j.Kelas) === String(filterKelasVal));
    }

    if (filterGuruVal !== 'Semua Guru') {
      filtered = filtered.filter(j => String(j.ID_Staff) === String(filterGuruVal));
    }

    // For jam filtering, we use simple text matching on the "Jam Ke-" field if available
    if (filterJamVal !== 'Semua Jam') {
       // Pagi (1-4), Siang (5-6), Malam
       filtered = filtered.filter(j => {
         const jamStr = String(j.Jam_Mengajar || j.Jam || '').toLowerCase();
         if (filterJamVal === 'Pagi') {
            return jamStr.includes('1') || jamStr.includes('2') || jamStr.includes('3') || jamStr.includes('4') || jamStr.includes('pagi');
         } else if (filterJamVal === 'Siang') {
            return jamStr.includes('5') || jamStr.includes('6') || jamStr.includes('7') || jamStr.includes('8') || jamStr.includes('siang');
         } else if (filterJamVal === 'Malam') {
            return jamStr.includes('malam') || jamStr.includes('ekstra');
         }
         return true;
       });
    }

    tbody.innerHTML = '';
    
    if (filtered.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="text-center py-5 text-muted">Tidak ada jadwal yang cocok dengan filter.</td></tr>';
      return;
    }

    // Sort jadwal by class number
    filtered.sort((a, b) => {
      const numA = parseInt(String(a.Kelas).match(/\d+/)?.[0] || 0);
      const numB = parseInt(String(b.Kelas).match(/\d+/)?.[0] || 0);
      return numA - numB;
    });

    filtered.forEach(j => {
      let jamText = "";
      if (j.Jam_Mulai && j.Jam_Selesai) {
        jamText = `${formatTime(j.Jam_Mulai)} - ${formatTime(j.Jam_Selesai)}`;
      } else {
        jamText = j.Jam_Mengajar || j.Jam || (j.Jam_Mulai + ' - ' + j.Jam_Selesai);
      }
      
      const st = (allStaff || []).find(s => s.ID_Staff === j.ID_Staff);
      let namaGuru = st ? st.Nama_Lengkap : (j.Nama_Guru || j.ID_Staff);
      
      const mapelObj = allMapel.find(m => m.ID_Mapel === j.ID_Mapel);
      const namaMapel = mapelObj ? mapelObj.Nama_Mapel : j.ID_Mapel;
      
      // We pass the required data in data- attributes so click can handle it
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="py-3 px-4">${j.Hari || '-'}</td>
        <td class="py-3 px-4"><span class="badge bg-light text-secondary border border-secondary-subtle">${jamText}</span></td>
        <td class="py-3 px-4 fw-medium text-primary">${j.Kelas || '-'}</td>
        <td class="py-3 px-4">${namaMapel || '-'}</td>
        <td class="py-3 px-4 text-muted">${namaGuru || '-'}</td>
      `;
      
      tr.addEventListener('click', () => {
         selectJadwalFromDashboard(j.ID_Staff, j.ID_Mapel, j.Kelas, jamText);
      });
      
      tbody.appendChild(tr);
    });
  }

  function selectJadwalFromDashboard(idGuru, idMapel, kelas, jamText) {
     // Hide dashboard, show config
     document.getElementById('dashboard-section').classList.add('d-none');
     document.getElementById('config-section').classList.remove('d-none');
     if(document.getElementById('welcome-header')) document.getElementById('welcome-header').classList.add('d-none');
     if(document.getElementById('main-nav-container')) document.getElementById('main-nav-container').classList.add('d-none');
     
     // Set dropdowns manually and trigger cascades
     selGuru.value = idGuru;
     updateMapel(); // this populates Mapel based on Guru
     
     setTimeout(() => {
       selMapel.value = idMapel;
       updateKelas(); // this populates Kelas based on Mapel
       
       setTimeout(() => {
         selKelas.value = kelas;
         updateJam(); // this populates Jam
         
         setTimeout(() => {
           // Some jam options might have day prefix
           // So we select by matching text
           for (let i = 0; i < selJam.options.length; i++) {
             if (selJam.options[i].value.includes(jamText)) {
               selJam.selectedIndex = i;
               break;
             }
           }
           
           if (selJam.value) {
             btnLoad.disabled = false;
             // Don't auto-start progress bar here to let them see the config first
           }
         }, 50);
       }, 50);
     }, 50);
  }

  // --- Log Presensi Logic ---
  const navJadwal = document.getElementById('nav-jadwal');
  const navLog = document.getElementById('nav-log');
  const dashboardSection = document.getElementById('dashboard-section');
  const logSection = document.getElementById('log-section');
  const configSection = document.getElementById('config-section');
  
  const filterPeriodeLog = document.getElementById('filter-periode-log');
  const wrapperSingleDate = document.getElementById('wrapper-single-date');
  const wrapperRangeTanggal = document.getElementById('wrapper-range-tanggal');
  const filterStartDateLog = document.getElementById('filter-start-date-log');
  const filterEndDateLog = document.getElementById('filter-end-date-log');
  const btnApplyRangeLog = document.getElementById('btn-apply-range-log');
  const filterTanggalLog = document.getElementById('filter-tanggal-log');
  const filterKelasLog = document.getElementById('filter-kelas-log');
  const filterStatusLog = document.getElementById('filter-status-log');
  const filterSearchLog = document.getElementById('filter-search-log');
  const btnRefreshLog = document.getElementById('btn-refresh-log');
  const btnPrintLog = document.getElementById('btn-print-log');
  const tbodyLog = document.getElementById('body-log');

  let currentRawLogData = [];

  // Set default date to today on load
  const todayDateStr = new Date().toISOString().split('T')[0];
  if (filterTanggalLog) {
    filterTanggalLog.value = todayDateStr;
  }
  if (filterStartDateLog) {
    filterStartDateLog.value = todayDateStr;
  }
  if (filterEndDateLog) {
    filterEndDateLog.value = todayDateStr;
  }

  function formatDateIndo(dateStr) {
    if (!dateStr) return '-';
    try {
      const parts = String(dateStr).split('T')[0].split('-');
      if (parts.length === 3) {
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
      }
    } catch (e) {}
    return dateStr;
  }

  function getLogDateRange() {
    const periode = filterPeriodeLog ? filterPeriodeLog.value : 'today';
    const now = new Date();
    const fmt = (d) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    };

    if (periode === 'today') {
      const tgl = filterTanggalLog && filterTanggalLog.value ? filterTanggalLog.value : fmt(now);
      return { startDate: tgl, endDate: tgl, label: 'Hari Ini (' + formatDateIndo(tgl) + ')' };
    }
    if (periode === 'this_week') {
      const day = now.getDay(); // 0 is Ahad
      const diffToMonday = (day === 0 ? 6 : day - 1);
      const monday = new Date(now);
      monday.setDate(now.getDate() - diffToMonday);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      return { startDate: fmt(monday), endDate: fmt(sunday), label: `Pekan Ini (${formatDateIndo(fmt(monday))} - ${formatDateIndo(fmt(sunday))})` };
    }
    if (periode === 'last_week') {
      const day = now.getDay();
      const diffToLastMonday = (day === 0 ? 6 : day - 1) + 7;
      const lastMonday = new Date(now);
      lastMonday.setDate(now.getDate() - diffToLastMonday);
      const lastSunday = new Date(lastMonday);
      lastSunday.setDate(lastMonday.getDate() + 6);
      return { startDate: fmt(lastMonday), endDate: fmt(lastSunday), label: `Pekan Lalu (${formatDateIndo(fmt(lastMonday))} - ${formatDateIndo(fmt(lastSunday))})` };
    }
    if (periode === 'this_month') {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      return { startDate: fmt(firstDay), endDate: fmt(lastDay), label: `Bulan Ini (${formatDateIndo(fmt(firstDay))} - ${formatDateIndo(fmt(lastDay))})` };
    }
    if (periode === 'last_month') {
      const firstDay = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastDay = new Date(now.getFullYear(), now.getMonth(), 0);
      return { startDate: fmt(firstDay), endDate: fmt(lastDay), label: `Bulan Lalu (${formatDateIndo(fmt(firstDay))} - ${formatDateIndo(fmt(lastDay))})` };
    }
    if (periode === 'custom') {
      const start = filterStartDateLog && filterStartDateLog.value ? filterStartDateLog.value : fmt(now);
      const end = filterEndDateLog && filterEndDateLog.value ? filterEndDateLog.value : fmt(now);
      return { startDate: start, endDate: end, label: `${formatDateIndo(start)} s/d ${formatDateIndo(end)}` };
    }
    return { startDate: fmt(now), endDate: fmt(now), label: formatDateIndo(fmt(now)) };
  }

  if (navJadwal && navLog) {
    navJadwal.addEventListener('change', () => {
      if(navJadwal.checked) {
        dashboardSection.classList.remove('d-none');
        logSection.classList.add('d-none');
        configSection.classList.add('d-none');
      }
    });
    navLog.addEventListener('change', () => {
      if(navLog.checked) {
        dashboardSection.classList.add('d-none');
        logSection.classList.remove('d-none');
        configSection.classList.add('d-none');
        // Fetch log for current range
        if(!filterTanggalLog.value) {
           filterTanggalLog.value = todayDateStr;
        }
        fetchLogKbm();
      }
    });
  }

  if (filterPeriodeLog) {
    filterPeriodeLog.addEventListener('change', () => {
      const val = filterPeriodeLog.value;
      if (val === 'today') {
        if (wrapperSingleDate) wrapperSingleDate.classList.remove('d-none');
        if (wrapperRangeTanggal) wrapperRangeTanggal.classList.add('d-none');
      } else if (val === 'custom') {
        if (wrapperSingleDate) wrapperSingleDate.classList.add('d-none');
        if (wrapperRangeTanggal) wrapperRangeTanggal.classList.remove('d-none');
        const now = new Date();
        const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        if (!filterStartDateLog.value) {
          const sevenDaysAgo = new Date();
          sevenDaysAgo.setDate(now.getDate() - 7);
          filterStartDateLog.value = fmt(sevenDaysAgo);
        }
        if (!filterEndDateLog.value) {
          filterEndDateLog.value = fmt(now);
        }
      } else {
        if (wrapperSingleDate) wrapperSingleDate.classList.add('d-none');
        if (wrapperRangeTanggal) wrapperRangeTanggal.classList.add('d-none');
      }
      fetchLogKbm();
    });
  }

  if (filterTanggalLog) filterTanggalLog.addEventListener('change', fetchLogKbm);
  if (btnApplyRangeLog) btnApplyRangeLog.addEventListener('click', fetchLogKbm);
  if (filterStartDateLog) filterStartDateLog.addEventListener('change', () => {
    if (filterPeriodeLog && filterPeriodeLog.value === 'custom') fetchLogKbm();
  });
  if (filterEndDateLog) filterEndDateLog.addEventListener('change', () => {
    if (filterPeriodeLog && filterPeriodeLog.value === 'custom') fetchLogKbm();
  });

  if (filterKelasLog) filterKelasLog.addEventListener('change', applyLogFilters);
  if (filterStatusLog) filterStatusLog.addEventListener('change', applyLogFilters);
  if (filterSearchLog) filterSearchLog.addEventListener('input', applyLogFilters);
  if (btnRefreshLog) btnRefreshLog.addEventListener('click', fetchLogKbm);
  if (btnPrintLog) btnPrintLog.addEventListener('click', () => printLogTable());

  async function fetchLogKbm() {
    const range = getLogDateRange();
    
    tbodyLog.innerHTML = `<tr><td colspan="11" class="text-center py-5 text-muted"><div class="spinner-border spinner-border-sm text-primary me-2" role="status"></div> Memuat log presensi (${range.label})...</td></tr>`;
    showLoading(true);

    try {
      const payload = { 
        action: 'get_log_kbm', 
        startDate: range.startDate, 
        endDate: range.endDate,
        tanggal: range.startDate 
      };
      
      const response = await fetch("https://script.google.com/macros/s/AKfycbxWjwlc6-mXpOimodZMFvQIC8hwdGRAz78PqnYIfQgSuXKkI9fUP4hXfC5x3QUIypiT/exec?action=get_log_kbm", {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload)
      });
      const res = await response.json();
      
      if(res.success) {
        currentRawLogData = res.data || [];
        populateKelasFilterLog(currentRawLogData);
        applyLogFilters();
      } else {
        Swal.fire('Error', res.message || 'Gagal memuat log.', 'error');
        tbodyLog.innerHTML = `<tr><td colspan="11" class="text-center py-5 text-danger">Gagal memuat log presensi.</td></tr>`;
      }
    } catch(e) {
       console.error(e);
       Swal.fire('Error', 'Terjadi kesalahan jaringan.', 'error');
       tbodyLog.innerHTML = `<tr><td colspan="11" class="text-center py-5 text-danger">Terjadi kesalahan jaringan.</td></tr>`;
    } finally {
       showLoading(false);
    }
  }

  function populateKelasFilterLog(data) {
    if (!filterKelasLog) return;
    const currentVal = filterKelasLog.value;
    const classes = [...new Set(data.map(d => d.kelas).filter(Boolean))].sort();
    filterKelasLog.innerHTML = '<option value="Semua">Semua Kelas</option>';
    classes.forEach(c => {
      filterKelasLog.innerHTML += `<option value="${c}">${c}</option>`;
    });
    if (classes.includes(currentVal)) {
      filterKelasLog.value = currentVal;
    }
  }

  function applyLogFilters() {
    let filtered = currentRawLogData;
    const kelasVal = filterKelasLog ? filterKelasLog.value : 'Semua';
    const statusVal = filterStatusLog ? filterStatusLog.value : 'Semua';
    const searchVal = filterSearchLog ? filterSearchLog.value.toLowerCase().trim() : '';

    if (kelasVal !== 'Semua') {
      filtered = filtered.filter(d => String(d.kelas) === String(kelasVal));
    }
    if (statusVal === 'Sudah Isi') {
      filtered = filtered.filter(d => d.status_isi === true || d.status_guru === 'Hadir');
    } else if (statusVal === 'Belum Isi') {
      filtered = filtered.filter(d => d.status_isi !== true && d.status_guru !== 'Hadir');
    }
    if (searchVal) {
      filtered = filtered.filter(d => 
        (d.guru && d.guru.toLowerCase().includes(searchVal)) ||
        (d.pelajaran && d.pelajaran.toLowerCase().includes(searchVal)) ||
        (d.kelas && d.kelas.toLowerCase().includes(searchVal)) ||
        (d.materi && d.materi.toLowerCase().includes(searchVal)) ||
        (d.tanggal && d.tanggal.includes(searchVal)) ||
        (d.hari && d.hari.toLowerCase().includes(searchVal))
      );
    }

    // Update Summary Statistics
    updateLogStats(currentRawLogData);
    renderLogTable(filtered);
  }

  function updateLogStats(data) {
    const totalJadwal = data.length;
    const terlaksana = data.filter(d => d.status_isi === true || d.status_guru === 'Hadir').length;
    const belum = totalJadwal - terlaksana;

    let totalSantriHadir = 0;
    let totalSantriAll = 0;
    data.forEach(d => {
      if (d.status_isi) {
        const h = parseInt(d.hadir) || 0;
        const i = parseInt(d.izin) || 0;
        const s = parseInt(d.sakit) || 0;
        const a = parseInt(d.alfa) || 0;
        totalSantriHadir += h;
        totalSantriAll += (h + i + s + a);
      }
    });
    const persenHadir = totalSantriAll > 0 ? Math.round((totalSantriHadir / totalSantriAll) * 100) : 0;

    const elTotal = document.getElementById('stat-total-jadwal');
    const elTerlaksana = document.getElementById('stat-terlaksana');
    const elBelum = document.getElementById('stat-belum-terisi');
    const elPersen = document.getElementById('stat-persen-hadir');

    if (elTotal) elTotal.innerText = totalJadwal;
    if (elTerlaksana) elTerlaksana.innerText = terlaksana;
    if (elBelum) elBelum.innerText = belum;
    if (elPersen) elPersen.innerText = persenHadir + '%';
  }

  function renderLogTable(data) {
    if (!data || data.length === 0) {
      tbodyLog.innerHTML = `<tr><td colspan="11" class="text-center py-5 text-muted"><div class="text-center mb-3"><i class="bi bi-calendar2-x display-4 text-light"></i></div>Tidak ada log KBM yang cocok dengan filter.</td></tr>`;
      return;
    }

    tbodyLog.innerHTML = '';
    data.forEach((item, index) => {
      window.santriDetailsCache = window.santriDetailsCache || {};
      if (item.status_isi && item.catatan_santri) {
         window.santriDetailsCache[item.id_jurnal] = item.catatan_santri;
      }

      let badgeMasuk = '';
      if (item.status_isi || item.status_guru === 'Hadir') {
         if (item.late_mins > 0) {
            badgeMasuk = `<div class="mt-1"><span class="badge bg-danger rounded-pill" style="font-size: 0.7rem;">Terlambat ${item.late_mins} mnt</span></div>`;
         } else if (item.waktu && item.waktu !== '-') {
            badgeMasuk = `<div class="mt-1"><span class="badge bg-success rounded-pill" style="font-size: 0.7rem;">Tepat waktu</span></div>`;
         }
      }

      let badgeKeluar = '';
      if (item.status_isi || item.status_guru === 'Hadir') {
         if (item.jam_ke && item.jam_ke !== '-') {
            if (item.over_mins > 0) {
               badgeKeluar = `<div class="mt-1"><span class="badge bg-warning text-dark rounded-pill" style="font-size: 0.7rem;">Lebih ${item.over_mins} mnt</span></div>`;
            }
         } else if (item.status_isi) {
            badgeKeluar = `<div class="mt-1"><span class="badge bg-danger rounded-pill" style="font-size: 0.7rem;">Tidak mengisi</span></div>`;
         }
      }
      
      let statusHtml = '';
      if (item.status_isi) {
          statusHtml = `<span class="badge bg-success"><i class="bi bi-check-circle me-1"></i>Hadir</span>`;
      } else if (item.status_guru === 'Hadir') {
          statusHtml = `<span class="badge bg-success bg-opacity-75 text-white" title="Guru telah hadir (Clock-in)"><i class="bi bi-check2-circle me-1"></i>Hadir (Clock-In)</span>`;
      } else if (item.status_guru === 'Izin') {
          statusHtml = `<span class="badge bg-info text-dark"><i class="bi bi-info-circle me-1"></i>Izin</span>`;
      } else if (item.status_guru === 'Sakit') {
          statusHtml = `<span class="badge bg-warning text-dark"><i class="bi bi-heart-pulse me-1"></i>Sakit</span>`;
      } else {
          statusHtml = `<span class="badge bg-secondary text-light"><i class="bi bi-dash-circle me-1"></i>Belum mengisi</span>`;
      }

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="fw-medium">${item.no}</td>
        <td class="text-nowrap">
           <div class="fw-semibold text-dark small">${item.hari || '-'}, ${formatDateIndo(item.tanggal)}</div>
        </td>
        <td>
           <span class="badge bg-light text-dark border"><i class="bi bi-clock me-1"></i>${item.waktu}</span>
           ${badgeMasuk}
        </td>
        <td class="text-nowrap">
           <span class="badge bg-light text-dark border"><i class="bi bi-clock me-1"></i>${item.jam_ke}</span>
           ${badgeKeluar}
        </td>
        <td><span class="badge bg-primary">${item.kelas}</span></td>
        <td class="fw-medium">${item.pelajaran}</td>
        <td>${item.guru}</td>
        <td>${statusHtml}</td>
        <td class="text-center">
           <span class="badge bg-success" style="cursor: pointer;" title="Hadir" onclick="showDetailSantriModal('${item.id_jurnal}', 'Hadir')">${item.hadir}</span> /
           <span class="badge bg-warning text-dark" style="cursor: pointer;" title="Izin" onclick="showDetailSantriModal('${item.id_jurnal}', 'Izin')">${item.izin}</span> /
           <span class="badge bg-info text-dark" style="cursor: pointer;" title="Sakit" onclick="showDetailSantriModal('${item.id_jurnal}', 'Sakit')">${item.sakit}</span> /
           <span class="badge bg-danger" style="cursor: pointer;" title="Alfa" onclick="showDetailSantriModal('${item.id_jurnal}', 'Alfa')">${item.alfa}</span>
        </td>
        <td>
           <div class="fw-medium small">${item.materi || '-'}</div>
           <div class="text-muted small fst-italic mt-1">${item.catatan_kelas || ''}</div>
        </td>
        <td>
           ${item.status_isi ? `<div class="d-flex gap-1 justify-content-center">
             <button class="btn btn-sm btn-outline-primary rounded-pill py-0 px-2 btn-edit-log" data-id="${item.id_jurnal}" title="Edit Log Presensi & Jurnal">
               <i class="bi bi-pencil"></i>
             </button>
             <button class="btn btn-sm btn-outline-danger rounded-pill py-0 px-2 btn-delete-log" data-id="${item.id_jurnal}" title="Hapus Log">
               <i class="bi bi-trash"></i>
             </button>
           </div>` : '-'}
        </td>
      `;
      tbodyLog.appendChild(tr);
    });

    // Bind edit buttons to open Modal Edit
    document.querySelectorAll('.btn-edit-log').forEach(btn => {
       btn.addEventListener('click', (e) => {
          const idJurnal = e.currentTarget.getAttribute('data-id');
          openEditLogModal(idJurnal);
       });
    });

    // Bind delete buttons
    document.querySelectorAll('.btn-delete-log').forEach(btn => {
       btn.addEventListener('click', (e) => {
          const idJurnal = e.currentTarget.getAttribute('data-id');
          confirmDeleteLog(idJurnal);
       });
    });
  }

  // Modal Rincian Santri (Hadir / Izin / Sakit / Alfa)
  window.showDetailSantriModal = function(idJurnal, selectedFilter) {
    if (!idJurnal) {
      Swal.fire('Info', 'Sesi KBM ini belum diisi oleh guru pengajar.', 'info');
      return;
    }

    const item = (currentRawLogData || []).find(d => d.id_jurnal === idJurnal || d.id_jadwal === idJurnal);
    if (!item || !item.status_isi) {
      Swal.fire('Info', 'Data kehadiran belum diisi pada sesi KBM ini.', 'info');
      return;
    }

    const rawSantriList = item.catatan_santri || (window.santriDetailsCache && window.santriDetailsCache[idJurnal]) || [];
    const santriMap = new Map();
    rawSantriList.forEach((s, idx) => {
      const sId = String(s.nis || s.id_santri || s.nama || `S_${idx}`).trim();
      if (!santriMap.has(sId)) {
        santriMap.set(sId, s);
      }
    });
    const santriList = Array.from(santriMap.values());
    if (santriList.length === 0) {
      Swal.fire('Info', 'Tidak ada data rincian santri untuk sesi ini.', 'info');
      return;
    }

    const modalTitle = document.getElementById('modal-detail-santri-title');
    const modalBody = document.getElementById('modal-detail-santri-body');
    if (!modalBody) return;

    let currentFilter = selectedFilter || 'Semua';

    function renderDetailContent() {
      const getBadge = (st) => {
        st = String(st || 'Hadir').toLowerCase();
        if (st.includes('hadir')) return '<span class="badge bg-success">Hadir</span>';
        if (st.includes('izin')) return '<span class="badge bg-warning text-dark">Izin</span>';
        if (st.includes('sakit')) return '<span class="badge bg-info text-dark">Sakit</span>';
        if (st.includes('alfa')) return '<span class="badge bg-danger">Alfa</span>';
        return `<span class="badge bg-secondary">${st}</span>`;
      };

      let filtered = santriList;
      if (currentFilter !== 'Semua') {
        filtered = santriList.filter(s => String(s.status || '').toLowerCase().includes(currentFilter.toLowerCase()));
      }

      if (modalTitle) {
        modalTitle.innerHTML = `<i class="bi bi-people-fill text-primary me-2"></i>Rincian Kehadiran Santri`;
      }

      let subHeaderHtml = `
        <div class="p-3 bg-light rounded-3 mb-3 border">
          <div class="d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-2">
            <div>
              <div class="fw-bold text-dark fs-6">${item.pelajaran} - Kelas ${item.kelas}</div>
              <div class="text-muted small">Guru: <span class="fw-medium text-dark">${item.guru}</span> | Waktu: <span class="fw-medium text-dark">${item.waktu || '-'}</span> | <span class="text-primary fw-medium">${formatIndoDate(item.tanggal)}</span></div>
            </div>
            <div class="btn-group btn-group-sm flex-wrap shadow-sm rounded-pill p-1 bg-white border" role="group">
              <button type="button" class="btn btn-sm ${currentFilter === 'Semua' ? 'btn-primary' : 'btn-light'} rounded-pill px-2 py-0 fw-medium btn-filter-detail" data-filter="Semua">Semua (${santriList.length})</button>
              <button type="button" class="btn btn-sm ${currentFilter === 'Hadir' ? 'btn-success' : 'btn-light'} rounded-pill px-2 py-0 fw-medium btn-filter-detail" data-filter="Hadir">Hadir (${item.hadir || 0})</button>
              <button type="button" class="btn btn-sm ${currentFilter === 'Izin' ? 'btn-warning text-dark' : 'btn-light'} rounded-pill px-2 py-0 fw-medium btn-filter-detail" data-filter="Izin">Izin (${item.izin || 0})</button>
              <button type="button" class="btn btn-sm ${currentFilter === 'Sakit' ? 'btn-info text-dark' : 'btn-light'} rounded-pill px-2 py-0 fw-medium btn-filter-detail" data-filter="Sakit">Sakit (${item.sakit || 0})</button>
              <button type="button" class="btn btn-sm ${currentFilter === 'Alfa' ? 'btn-danger' : 'btn-light'} rounded-pill px-2 py-0 fw-medium btn-filter-detail" data-filter="Alfa">Alfa (${item.alfa || 0})</button>
            </div>
          </div>
        </div>
      `;

      let tableHtml = '';
      if (filtered.length === 0) {
        tableHtml = `
          <div class="text-center py-4 text-muted">
            <i class="bi bi-person-x display-6 text-secondary d-block mb-2"></i>
            Tidak ada santri dengan status <b>${currentFilter}</b> pada sesi ini.
          </div>
        `;
      } else {
        let rows = filtered.map((s, idx) => `
          <tr>
            <td class="text-muted small text-center" style="width: 40px;">${idx + 1}</td>
            <td class="fw-medium">${s.nama || s.nis || '-'}</td>
            <td class="text-center" style="width: 100px;">${getBadge(s.status)}</td>
            <td class="text-center fw-semibold text-primary" style="width: 80px;">${(s.nilai !== undefined && s.nilai !== null && s.nilai !== '') ? s.nilai : '-'}</td>
            <td class="text-muted small">${s.catatan || '-'}</td>
          </tr>
        `).join('');

        tableHtml = `
          <div class="table-responsive" style="max-height: 380px;">
            <table class="table table-sm table-hover align-middle mb-0">
              <thead class="table-light text-muted small position-sticky top-0">
                <tr>
                  <th class="text-center" style="width: 40px;">No</th>
                  <th>Nama Santri</th>
                  <th class="text-center" style="width: 100px;">Status</th>
                  <th class="text-center" style="width: 80px;">Nilai</th>
                  <th>Catatan</th>
                </tr>
              </thead>
              <tbody>
                ${rows}
              </tbody>
            </table>
          </div>
        `;
      }

      modalBody.innerHTML = subHeaderHtml + tableHtml;

      modalBody.querySelectorAll('.btn-filter-detail').forEach(btn => {
        btn.addEventListener('click', (e) => {
          currentFilter = e.currentTarget.getAttribute('data-filter');
          renderDetailContent();
        });
      });
    }

    renderDetailContent();

    const modalEl = document.getElementById('modal-detail-santri');
    if (modalEl) {
      const bsModal = bootstrap.Modal.getOrCreateInstance(modalEl);
      bsModal.show();
    }
  };

  function openEditLogModal(idJurnal) {
    const item = currentRawLogData.find(d => d.id_jurnal === idJurnal);
    if (!item) {
      Swal.fire('Error', 'Data log tidak ditemukan.', 'error');
      return;
    }

    document.getElementById('edit-log-id-jurnal').value = item.id_jurnal || '';
    document.getElementById('edit-log-id-jadwal').value = item.id_jadwal || '';
    document.getElementById('edit-log-id-mapel').value = item.id_mapel || '';
    document.getElementById('edit-log-kelas').value = item.kelas || '';
    document.getElementById('edit-log-tanggal').value = item.tanggal || filterTanggalLog.value;
    document.getElementById('edit-log-id-guru').value = item.id_guru || item.guru || '';
    document.getElementById('edit-log-materi').value = item.materi || '';
    document.getElementById('edit-log-catatan-kelas').value = item.catatan_kelas || '';
    const tglDisplay = formatIndoDate(item.tanggal || filterTanggalLog.value);
    document.getElementById('edit-log-subinfo').innerText = `Kelas ${item.kelas} - ${item.pelajaran} | Guru: ${item.guru} (${tglDisplay})`;

    // Helper format waktu ke HH:mm untuk input type="time"
    function cleanTimeForInput(val) {
      if (!val || val === '-') return '';
      const str = String(val).trim();
      const match = str.match(/(\d{1,2})[:.](\d{2})/);
      if (match) {
        const h = match[1].padStart(2, '0');
        const m = match[2];
        return `${h}:${m}`;
      }
      return '';
    }

    const jamMasukVal = cleanTimeForInput(item.waktu) || cleanTimeForInput(item.scheduled_masuk);
    const jamKeluarVal = cleanTimeForInput(item.jam_ke) || cleanTimeForInput(item.scheduled_keluar);
    
    const inpJamMasuk = document.getElementById('edit-log-jam-masuk');
    const inpJamKeluar = document.getElementById('edit-log-jam-keluar');
    if (inpJamMasuk) inpJamMasuk.value = jamMasukVal;
    if (inpJamKeluar) inpJamKeluar.value = jamKeluarVal;

    const tbody = document.getElementById('edit-log-tbody-santri');
    tbody.innerHTML = '';

    const rawSantriList = item.catatan_santri || [];
    const santriMap = new Map();
    rawSantriList.forEach((s, idx) => {
      const sId = String(s.nis || s.id_santri || s.nama || `S_${idx}`).trim();
      if (!santriMap.has(sId)) {
        santriMap.set(sId, s);
      }
    });
    const santriList = Array.from(santriMap.values());

    if (santriList.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="text-center py-3 text-muted">Tidak ada rincian santri pada sesi ini.</td></tr>';
    } else {
      santriList.forEach((s, idx) => {
        const sId = s.nis || s.id_santri || `S_${idx}`;
        const st = String(s.status || 'Hadir').toLowerCase();
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td class="text-muted small">${idx + 1}</td>
          <td class="fw-medium">
            ${s.nama}
            <input type="hidden" class="edit-santri-id" value="${sId}">
            <input type="hidden" class="edit-santri-nama" value="${s.nama}">
          </td>
          <td class="text-center">
            <div class="attendance-radios">
              <input type="radio" name="edit_abs_${sId}" id="edit_hadir_${sId}" value="Hadir" ${st.includes('hadir') ? 'checked' : ''}>
              <label for="edit_hadir_${sId}">Hadir</label>
              
              <input type="radio" name="edit_abs_${sId}" id="edit_sakit_${sId}" value="Sakit" ${st.includes('sakit') ? 'checked' : ''}>
              <label for="edit_sakit_${sId}">Sakit</label>
              
              <input type="radio" name="edit_abs_${sId}" id="edit_izin_${sId}" value="Izin" ${st.includes('izin') ? 'checked' : ''}>
              <label for="edit_izin_${sId}">Izin</label>
              
              <input type="radio" name="edit_abs_${sId}" id="edit_alfa_${sId}" value="Alfa" ${st.includes('alfa') ? 'checked' : ''}>
              <label for="edit_alfa_${sId}">Alfa</label>
            </div>
          </td>
          <td>
            <input type="number" class="form-control form-control-sm text-center edit-santri-nilai" value="${s.nilai || ''}" placeholder="0-100" min="0" max="100">
          </td>
          <td>
            <input type="text" class="form-control form-control-sm edit-santri-catatan" value="${s.catatan || ''}" placeholder="Catatan...">
          </td>
        `;
        tbody.appendChild(tr);
      });
    }

    const editModal = new bootstrap.Modal(document.getElementById('modalEditLogKBM'));
    editModal.show();
  }

  // Handle Save Edit Log
  const btnSaveEditLog = document.getElementById('btn-save-edit-log');
  if (btnSaveEditLog) {
    btnSaveEditLog.addEventListener('click', async () => {
      const idJurnal = document.getElementById('edit-log-id-jurnal').value;
      const materi = document.getElementById('edit-log-materi').value.trim();
      const catatanKelas = document.getElementById('edit-log-catatan-kelas').value.trim();

      if (!materi) {
        Swal.fire('Perhatian', 'Materi Pokok / Bahasan Topik wajib diisi!', 'warning');
        return;
      }

      const rows = document.querySelectorAll('#edit-log-tbody-santri tr');
      const absensiList = [];
      rows.forEach(tr => {
        const idInp = tr.querySelector('.edit-santri-id');
        if (!idInp) return;
        const sId = idInp.value;
        const sNama = tr.querySelector('.edit-santri-nama') ? tr.querySelector('.edit-santri-nama').value : '';
        const radio = tr.querySelector(`input[name="edit_abs_${sId}"]:checked`);
        const nilaiInp = tr.querySelector('.edit-santri-nilai');
        const catatanInp = tr.querySelector('.edit-santri-catatan');

        absensiList.push({
          id_santri: sId,
          nis: sId,
          nama_santri: sNama,
          kehadiran: radio ? radio.value : 'Hadir',
          nilai: nilaiInp ? nilaiInp.value.trim() : '',
          catatan: catatanInp ? catatanInp.value.trim() : ''
        });
      });

      const jamMasuk = document.getElementById('edit-log-jam-masuk') ? document.getElementById('edit-log-jam-masuk').value.trim() : '';
      const jamKeluar = document.getElementById('edit-log-jam-keluar') ? document.getElementById('edit-log-jam-keluar').value.trim() : '';

      const payload = {
        action: 'update_log_kbm',
        id_jurnal: idJurnal,
        id_jadwal: document.getElementById('edit-log-id-jadwal').value,
        id_mapel: document.getElementById('edit-log-id-mapel').value,
        kelas: document.getElementById('edit-log-kelas').value,
        tanggal: document.getElementById('edit-log-tanggal').value,
        id_guru: document.getElementById('edit-log-id-guru').value,
        materi: materi,
        catatan: catatanKelas,
        jam_masuk: jamMasuk,
        jam_keluar: jamKeluar,
        absensi: absensiList
      };

      showLoading(true);
      try {
        const response = await fetch("https://script.google.com/macros/s/AKfycbxWjwlc6-mXpOimodZMFvQIC8hwdGRAz78PqnYIfQgSuXKkI9fUP4hXfC5x3QUIypiT/exec?action=update_log_kbm", {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify(payload)
        });
        const res = await response.json();
        showLoading(false);
        if (res.success) {
          bootstrap.Modal.getInstance(document.getElementById('modalEditLogKBM')).hide();
          Swal.fire('Berhasil!', 'Log Presensi & Jurnal KBM berhasil diperbarui.', 'success');
          fetchLogKbm();
        } else {
          Swal.fire('Gagal', res.message || 'Terjadi kesalahan.', 'error');
        }
      } catch(err) {
        showLoading(false);
        Swal.fire('Error', 'Gagal mengirim pembaruan ke server.', 'error');
      }
    });
  }

  function printLogTable() {
    window.print();
  }

  // Tombol Kembali
  const btnKembali = document.getElementById('btn-kembali-jadwal');
  if (btnKembali) {
    btnKembali.addEventListener('click', () => {
      document.getElementById('config-section').classList.add('d-none');
      
      if(document.getElementById('welcome-header')) document.getElementById('welcome-header').classList.remove('d-none');
      if(document.getElementById('main-nav-container')) document.getElementById('main-nav-container').classList.remove('d-none');

      // Show whatever was active
      if(navLog && navLog.checked) {
         logSection.classList.remove('d-none');
      } else {
         dashboardSection.classList.remove('d-none');
      }
      
      // Reset selections
      selGuru.value = "";
      selMapel.innerHTML = '<option value="" selected disabled>-- Mata Pelajaran --</option>';
      selMapel.disabled = true;
      selKelas.innerHTML = '<option value="" selected disabled>-- Kelas --</option>';
      selKelas.disabled = true;
      selJam.innerHTML = '<option value="" selected disabled>-- Jam Ke --</option>';
      selJam.disabled = true;
      btnLoad.disabled = true;
      document.getElementById('content-area').classList.add('d-none');
      
      const clockActions = document.getElementById('clock-actions');
      if (clockActions) clockActions.classList.add('d-none');
      
      const btnKeluar = document.getElementById('btn-jam-keluar');
      if (btnKeluar) btnKeluar.classList.add('d-none');
    });
  }

  // Enable cascade selects and filter based on selected Guru
  selGuru.addEventListener('change', updateMapel);
  selMapel.addEventListener('change', updateKelas);
  selKelas.addEventListener('change', updateJam);
  selJam.addEventListener('change', () => {
    if (selJam.value) {
      btnLoad.disabled = false;
      startProgressBar();
    }
  });

  function updateMapel() {
    const selectedGuru = selGuru.value;
    const guruJadwals = allJadwal.filter(j => j.ID_Staff === selectedGuru);
    
    const uniqueMapelIds = [...new Set(guruJadwals.map(j => j.ID_Mapel))].filter(Boolean);
    selMapel.innerHTML = '<option value="" selected disabled>-- Pilih Pelajaran --</option>';
    uniqueMapelIds.forEach(id => {
      const mapelObj = allMapel.find(m => m.ID_Mapel === id);
      const namaMapel = mapelObj ? mapelObj.Nama_Mapel : id;
      selMapel.innerHTML += `<option value="${id}">${namaMapel}</option>`;
    });
    
    selMapel.disabled = true;
    
    const clockActions = document.getElementById('clock-actions');
    const btnJamKeluar = document.getElementById('btn-jam-keluar');
    
    if(btnJamKeluar) btnJamKeluar.classList.add('d-none');
    
    if(uniqueMapelIds.length > 0) {
      if(clockActions) clockActions.classList.remove('d-none');
    } else {
      if(clockActions) clockActions.classList.add('d-none');
    }
    
    if (uniqueMapelIds.length === 1) {
      selMapel.value = uniqueMapelIds[0];
      updateKelas();
    } else {
      selKelas.innerHTML = '<option value="" selected disabled>-- Pilih Kelas --</option>';
      selKelas.disabled = true;
      selJam.innerHTML = '<option value="" selected disabled>-- Pilih Jam --</option>';
      selJam.disabled = true;
      btnLoad.disabled = true;
    }
  }

  function updateKelas() {
    const selectedGuru = selGuru.value;
    const selectedMapel = selMapel.value;
    const guruJadwals = allJadwal.filter(j => j.ID_Staff === selectedGuru && j.ID_Mapel === selectedMapel);
    
    const uniqueKelas = [...new Set(guruJadwals.map(j => j.Kelas))].filter(Boolean);
    selKelas.innerHTML = '<option value="" selected disabled>-- Pilih Kelas --</option>';
    uniqueKelas.forEach(k => selKelas.innerHTML += `<option value="${k}">${k}</option>`);
    
    selKelas.disabled = uniqueKelas.length === 0;
    
    if (uniqueKelas.length === 1) {
      selKelas.value = uniqueKelas[0];
      updateJam();
    } else {
      selJam.innerHTML = '<option value="" selected disabled>-- Pilih Jam --</option>';
      selJam.disabled = true;
      btnLoad.disabled = true;
    }
  }

  function updateJam() {
    const selectedGuru = selGuru.value;
    const selectedMapel = selMapel.value;
    const selectedKelas = selKelas.value;
    const guruJadwals = allJadwal.filter(j => j.ID_Staff === selectedGuru && j.ID_Mapel === selectedMapel && String(j.Kelas) === String(selectedKelas));
    
    const uniqueJamObjects = [];
    guruJadwals.forEach(j => {
      let jamText = "";
      if (j.Jam_Mulai && j.Jam_Selesai) {
        jamText = `${formatTime(j.Jam_Mulai)} - ${formatTime(j.Jam_Selesai)}`;
      } else {
        jamText = j.Jam_Mengajar || j.Jam || (j.Jam_Mulai + ' - ' + j.Jam_Selesai);
      }
      jamText = j.Hari ? `${j.Hari}, ${jamText}` : jamText;
      
      if(!uniqueJamObjects.find(u => u.text === jamText)) {
        uniqueJamObjects.push({ text: jamText, id: j.ID_Jadwal });
      }
    });
    
    selJam.innerHTML = '<option value="" selected disabled>-- Pilih Jam --</option>';
    uniqueJamObjects.forEach(jam => selJam.innerHTML += `<option value="${jam.text}" data-id="${jam.id}">${jam.text}</option>`);
    
    selJam.disabled = uniqueJamObjects.length === 0;
    
    if (uniqueJamObjects.length === 1) {
      selJam.value = uniqueJamObjects[0].text;
      btnLoad.disabled = false;
      startProgressBar();
    } else {
      btnLoad.disabled = true;
    }
  }

  // Call Init
  initData();

  function normalizeKelas(k) {
    if (!k && k !== 0) return '';
    const str = String(k).trim().toUpperCase();
    if (str === '7' || str === '7 SMP' || str === '7SMP' || str === 'VII' || str === 'KELAS 7' || str === 'KELAS 7 SMP') return '7 SMP';
    if (str === '8' || str === '8 SMP' || str === '8SMP' || str === 'VIII' || str === 'KELAS 8' || str === 'KELAS 8 SMP') return '8 SMP';
    if (str === '9' || str === '9 SMP' || str === '9SMP' || str === 'IX' || str === 'KELAS 9' || str === 'KELAS 9 SMP') return '9 SMP';
    if (str === '10' || str === '10 SMA' || str === '10SMA' || str === 'X' || str === 'KELAS 10' || str === 'KELAS 10 SMA') return '10 SMA';
    if (str === '11' || str === '11 SMA' || str === '11SMA' || str === 'XI' || str === 'KELAS 11' || str === 'KELAS 11 SMA') return '11 SMA';
    if (str === '12' || str === '12 SMA' || str === '12SMA' || str === 'XII' || str === 'KELAS 12' || str === 'KELAS 12 SMA') return '12 SMA';
    return str;
  }

  // Load Santri
  btnLoad.addEventListener('click', () => {
    if(!selGuru.value || !selKelas.value) return;
    
    showLoading(true);
    
    const selectedKelasName = selKelas.value;
    const targetNormKelas = normalizeKelas(selectedKelasName);
    
    // Filter santri asli dari database berdasarkan kelas dengan normalisasi cerdas & deduplikasi ketat
    const santriMap = new Map();
    allSantri.forEach(s => {
      const k1 = normalizeKelas(s.kelas || s.Kelas);
      const isClassMatch = (k1 === targetNormKelas || String(s.kelas) === String(selectedKelasName) || String(s.Kelas) === String(selectedKelasName));
      if (isClassMatch) {
        const nis = String(s.nis || s.NIS || s.id_santri || s.ID_Santri || '').trim();
        const nama = (s.nama || s.Nama_Lengkap || s.Nama_Santri || s.Nama || '').trim();
        const key = nis ? `NIS_${nis}` : `NAMA_${nama.toLowerCase()}`;
        if (key && !santriMap.has(key)) {
          santriMap.set(key, s);
        }
      }
    });
    
    let generatedSantri = Array.from(santriMap.values());
    
    // Urutkan secara alfabetis berdasarkan nama santri
    generatedSantri.sort((a, b) => {
      const nA = (a.Nama || a.Nama_Santri || a.Nama_Lengkap || a.nama || '').trim();
      const nB = (b.Nama || b.Nama_Santri || b.Nama_Lengkap || b.nama || '').trim();
      return nA.localeCompare(nB, 'id', { sensitivity: 'base' });
    });
    
    // Jika tidak ada santri ditemukan, berikan fallback
    if(generatedSantri.length === 0) {
      console.warn("Tidak ada santri ditemukan untuk kelas " + selectedKelasName);
    }
    
    // Format data santri agar sesuai dengan fungsi renderSantri (butuh id dan nama)
    const formattedSantri = generatedSantri.map((s, i) => ({
      id: s.id_santri || s.ID_Santri || s.nis || `S${i}`,
      nama: s.nama || s.Nama_Lengkap || s.Nama_Santri || s.Nama || 'Santri Tidak Dikenal',
      nis: s.nis || s.NIS || '',
      uid_card: s.uid_card || s.UID_Card || ''
    }));
    
    // Simulate API Fetch delay for UX
    setTimeout(() => {
      document.getElementById('content-area').classList.remove('d-none');
      renderSantri(formattedSantri);
      showLoading(false);
      
      // Auto-scroll to content
      document.getElementById('content-area').scrollIntoView({ behavior: 'smooth' });
    }, 800);
  });

  let currentLoadedSantri = [];
  let kbmNilaiState = {
    tipe_nilai: 'Tugas',
    materi: '',
    nilai_santri: {}
  };

  function renderSantri(data) {
    currentLoadedSantri = data || [];
    kbmNilaiState = {
      tipe_nilai: 'Tugas',
      materi: document.getElementById('input-materi') ? document.getElementById('input-materi').value : '',
      nilai_santri: {}
    };

    const badgeNilai = document.getElementById('badge-nilai-status');
    if (badgeNilai) {
      badgeNilai.className = 'badge bg-primary-subtle text-primary ms-1';
      badgeNilai.innerText = 'Opsional';
    }

    const tbody = document.getElementById('santri-tbody');
    document.getElementById('santri-count').innerText = data.length + " Santri";
    tbody.innerHTML = '';
    
    data.forEach((s, i) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="ps-4 fw-medium">
          <div class="d-flex align-items-center gap-3">
            <div class="avatar bg-light text-primary rounded-circle d-flex align-items-center justify-content-center fw-bold" style="width: 32px; height: 32px; font-size: 0.8rem;">
              ${i+1}
            </div>
            ${s.nama}
          </div>
        </td>
        <td class="text-center">
          <div class="attendance-radios">
            <input type="radio" name="abs_${s.id}" id="hadir_${s.id}" value="Hadir" checked>
            <label for="hadir_${s.id}">Hadir</label>
            
            <input type="radio" name="abs_${s.id}" id="sakit_${s.id}" value="Sakit">
            <label for="sakit_${s.id}">Sakit</label>
            
            <input type="radio" name="abs_${s.id}" id="izin_${s.id}" value="Izin">
            <label for="izin_${s.id}">Izin</label>
            
            <input type="radio" name="abs_${s.id}" id="alfa_${s.id}" value="Alfa">
            <label for="alfa_${s.id}">Alfa</label>
          </div>
        </td>
        <td class="pe-4">
          <input type="text" class="form-control form-control-sm bg-light" placeholder="Keterangan / Catatan santri..." id="catatan_${s.id}">
        </td>
      `;
      tbody.appendChild(tr);
    });

    // Pasang auto-save pada setiap radio dan input catatan santri
    tbody.querySelectorAll('input').forEach(inp => {
      inp.addEventListener('change', () => saveSessionState());
      inp.addEventListener('input', () => saveSessionState());
    });

    // Reset input pencarian saat data santri baru dirender
    const searchInp = document.getElementById('search-santri');
    if (searchInp) searchInp.value = '';
    
    // Auto-save state saat data santri dimuat
    saveSessionState();
  }

  // --- Pencarian Nama Santri Real-Time ---
  const searchSantriInput = document.getElementById('search-santri');
  if (searchSantriInput) {
    searchSantriInput.addEventListener('input', () => {
      const q = searchSantriInput.value.toLowerCase().trim();
      const rows = document.querySelectorAll('#santri-tbody tr');
      let visibleCount = 0;
      rows.forEach(tr => {
        const text = tr.innerText.toLowerCase();
        if (!q || text.includes(q)) {
          tr.style.display = '';
          visibleCount++;
        } else {
          tr.style.display = 'none';
        }
      });
      const countBadge = document.getElementById('santri-count');
      if (countBadge) {
        if (q) {
          countBadge.innerText = `${visibleCount} dari ${rows.length} Santri`;
        } else {
          countBadge.innerText = `${rows.length} Santri`;
        }
      }
    });
  }

  // --- Mode Fullscreen / Zoom Tabel Presensi ---
  const btnFullscreenSantri = document.getElementById('btn-fullscreen-santri');
  const cardPresensiSantri = document.getElementById('card-presensi-santri');
  if (btnFullscreenSantri && cardPresensiSantri) {
    btnFullscreenSantri.addEventListener('click', () => {
      const isFullscreen = cardPresensiSantri.classList.toggle('table-fullscreen-mode');
      if (isFullscreen) {
        btnFullscreenSantri.innerHTML = '<i class="bi bi-fullscreen-exit text-danger"></i>';
        btnFullscreenSantri.title = 'Keluar Mode Layar Penuh';
        if (cardPresensiSantri.requestFullscreen) {
          cardPresensiSantri.requestFullscreen().catch(() => {});
        }
      } else {
        btnFullscreenSantri.innerHTML = '<i class="bi bi-arrows-fullscreen"></i>';
        btnFullscreenSantri.title = 'Mode Layar Penuh (Zoom)';
        if (document.fullscreenElement && document.exitFullscreen) {
          document.exitFullscreen().catch(() => {});
        }
      }
    });

    document.addEventListener('fullscreenchange', () => {
      if (!document.fullscreenElement && cardPresensiSantri.classList.contains('table-fullscreen-mode')) {
        cardPresensiSantri.classList.remove('table-fullscreen-mode');
        btnFullscreenSantri.innerHTML = '<i class="bi bi-arrows-fullscreen"></i>';
        btnFullscreenSantri.title = 'Mode Layar Penuh (Zoom)';
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && cardPresensiSantri.classList.contains('table-fullscreen-mode')) {
        cardPresensiSantri.classList.remove('table-fullscreen-mode');
        btnFullscreenSantri.innerHTML = '<i class="bi bi-arrows-fullscreen"></i>';
        btnFullscreenSantri.title = 'Mode Layar Penuh (Zoom)';
      }
    });
  }

  // --- Modal Penilaian KBM / Nilai Harian Events ---
  const btnOpenModalNilai = document.getElementById('btn-open-modal-nilai');
  const btnModalApplyAllNilai = document.getElementById('btn-modal-apply-all-nilai');
  const btnModalSaveNilai = document.getElementById('btn-modal-save-nilai');
  const inputModalSearchNilai = document.getElementById('modal-nilai-search');
  const btnClearSearchNilai = document.getElementById('btn-clear-search-nilai');
  const modalNilaiTbody = document.getElementById('modal-nilai-tbody');

  function escapeHtmlSafe(str) {
    if (!str && str !== 0) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function updateModalNilaiCounters(shownCount) {
    if (!modalNilaiTbody) return;
    const total = (currentLoadedSantri && currentLoadedSantri.length) ? currentLoadedSantri.length : 0;
    const allInputs = modalNilaiTbody.querySelectorAll('.input-modal-nilai');
    let filled = 0;
    allInputs.forEach(inp => {
      if (inp.value.trim() !== '') filled++;
    });

    const shown = (shownCount !== undefined) ? shownCount : total;
    const countInfoEl = document.getElementById('modal-nilai-count-info');
    if (countInfoEl) {
      if (shown === total) {
        countInfoEl.innerHTML = `<i class="bi bi-people me-1 text-primary"></i>Total: <b>${total}</b> santri`;
      } else {
        countInfoEl.innerHTML = `<i class="bi bi-funnel me-1 text-warning"></i>Menampilkan: <b>${shown}</b> dari ${total} santri`;
      }
    }

    const filledInfoEl = document.getElementById('modal-nilai-filled-info');
    if (filledInfoEl) {
      filledInfoEl.innerHTML = `<i class="bi bi-check2-all me-1 text-success"></i><b>${filled}</b> dari ${total} dinilai`;
    }
  }

  function filterModalNilaiSantri() {
    if (!modalNilaiTbody) return;
    const query = inputModalSearchNilai ? inputModalSearchNilai.value.trim().toLowerCase() : '';
    
    if (btnClearSearchNilai) {
      if (query !== '') {
        btnClearSearchNilai.classList.remove('d-none');
      } else {
        btnClearSearchNilai.classList.add('d-none');
      }
    }

    const rows = modalNilaiTbody.querySelectorAll('tr.row-santri-nilai');
    let matchCount = 0;

    rows.forEach(tr => {
      const nama = tr.getAttribute('data-nama') || '';
      const nis = tr.getAttribute('data-nis') || '';
      const isMatch = !query || nama.includes(query) || nis.includes(query);

      if (isMatch) {
        tr.style.display = '';
        matchCount++;
      } else {
        tr.style.display = 'none';
      }
    });

    let emptyRow = document.getElementById('modal-nilai-empty-search');
    if (matchCount === 0) {
      if (!emptyRow) {
        emptyRow = document.createElement('tr');
        emptyRow.id = 'modal-nilai-empty-search';
        emptyRow.innerHTML = `
          <td colspan="4" class="text-center py-4 text-muted">
            <i class="bi bi-person-x fs-3 text-secondary d-block mb-1"></i>
            Santri dengan kata kunci "<b>${escapeHtmlSafe(query)}</b>" tidak ditemukan.
          </td>
        `;
        modalNilaiTbody.appendChild(emptyRow);
      } else {
        emptyRow.style.display = '';
        emptyRow.innerHTML = `
          <td colspan="4" class="text-center py-4 text-muted">
            <i class="bi bi-person-x fs-3 text-secondary d-block mb-1"></i>
            Santri dengan kata kunci "<b>${escapeHtmlSafe(query)}</b>" tidak ditemukan.
          </td>
        `;
      }
    } else if (emptyRow) {
      emptyRow.style.display = 'none';
    }

    updateModalNilaiCounters(matchCount);
  }

  if (inputModalSearchNilai) {
    inputModalSearchNilai.addEventListener('input', filterModalNilaiSantri);
    inputModalSearchNilai.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        // Fokuskan ke input nilai santri pertama yang tampak
        const firstVisibleRow = modalNilaiTbody.querySelector('tr.row-santri-nilai:not([style*="display: none"])');
        if (firstVisibleRow) {
          const firstInp = firstVisibleRow.querySelector('.input-modal-nilai');
          if (firstInp) {
            firstInp.focus();
            firstInp.select();
          }
        }
      } else if (e.key === 'Escape') {
        inputModalSearchNilai.value = '';
        filterModalNilaiSantri();
      }
    });
  }

  if (btnClearSearchNilai) {
    btnClearSearchNilai.addEventListener('click', () => {
      if (inputModalSearchNilai) {
        inputModalSearchNilai.value = '';
        filterModalNilaiSantri();
        inputModalSearchNilai.focus();
      }
    });
  }

  if (btnOpenModalNilai) {
    btnOpenModalNilai.addEventListener('click', () => {
      if (!currentLoadedSantri || currentLoadedSantri.length === 0) {
        Swal.fire('Perhatian', 'Silakan pilih jadwal dan muat data santri terlebih dahulu.', 'warning');
        return;
      }

      // Sync materi input if not filled
      const inpMateri = document.getElementById('input-materi');
      const modalMateri = document.getElementById('modal-nilai-materi');
      if (modalMateri && inpMateri && !modalMateri.value) {
        modalMateri.value = inpMateri.value;
      }

      if (inputModalSearchNilai) {
        inputModalSearchNilai.value = '';
      }
      if (btnClearSearchNilai) {
        btnClearSearchNilai.classList.add('d-none');
      }

      modalNilaiTbody.innerHTML = '';

      currentLoadedSantri.forEach((s, idx) => {
        const existing = (kbmNilaiState.nilai_santri && kbmNilaiState.nilai_santri[s.id]) || { nilai: '', catatan: '' };
        const tr = document.createElement('tr');
        tr.className = 'row-santri-nilai';
        tr.setAttribute('data-id', s.id);
        tr.setAttribute('data-nama', (s.nama || '').toLowerCase());
        tr.setAttribute('data-nis', (s.nis || '').toLowerCase());
        tr.innerHTML = `
          <td class="text-muted small text-center">${idx + 1}</td>
          <td>
            <div class="fw-semibold text-dark">${escapeHtmlSafe(s.nama)}</div>
            ${s.nis ? `<div class="text-muted small" style="font-size: 11px;">NIS: ${escapeHtmlSafe(s.nis)}</div>` : ''}
          </td>
          <td>
            <input type="number" class="form-control form-control-sm text-center input-modal-nilai" data-id="${s.id}" data-idx="${idx}" value="${existing.nilai || ''}" placeholder="0-100" min="0" max="100">
          </td>
          <td>
            <input type="text" class="form-control form-control-sm input-modal-catatan" data-id="${s.id}" value="${escapeHtmlSafe(existing.catatan || '')}" placeholder="Catatan...">
          </td>
        `;
        modalNilaiTbody.appendChild(tr);
      });

      // Pasang event listener pada setiap input nilai (live counter & navigasi keyboard)
      const allNilaiInps = modalNilaiTbody.querySelectorAll('.input-modal-nilai');
      allNilaiInps.forEach(inp => {
        inp.addEventListener('input', () => {
          updateModalNilaiCounters();
        });

        inp.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === 'ArrowDown') {
            e.preventDefault();
            // Navigasi ke input santri tampak berikutnya
            const currentTr = inp.closest('tr.row-santri-nilai');
            let nextTr = currentTr ? currentTr.nextElementSibling : null;
            while (nextTr) {
              if (nextTr.classList.contains('row-santri-nilai') && nextTr.style.display !== 'none') {
                const nextInp = nextTr.querySelector('.input-modal-nilai');
                if (nextInp) {
                  nextInp.focus();
                  nextInp.select();
                }
                break;
              }
              nextTr = nextTr.nextElementSibling;
            }
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            // Navigasi ke input santri tampak sebelumnya
            const currentTr = inp.closest('tr.row-santri-nilai');
            let prevTr = currentTr ? currentTr.previousElementSibling : null;
            while (prevTr) {
              if (prevTr.classList.contains('row-santri-nilai') && prevTr.style.display !== 'none') {
                const prevInp = prevTr.querySelector('.input-modal-nilai');
                if (prevInp) {
                  prevInp.focus();
                  prevInp.select();
                }
                break;
              }
              prevTr = prevTr.previousElementSibling;
            }
          }
        });
      });

      updateModalNilaiCounters(currentLoadedSantri.length);

      const modalEl = document.getElementById('modalNilaiKBM');
      if (modalEl) {
        const myModal = bootstrap.Modal.getOrCreateInstance(modalEl);
        myModal.show();
        
        // Auto-fokus ke search bar setelah modal terbuka
        setTimeout(() => {
          if (inputModalSearchNilai) inputModalSearchNilai.focus();
        }, 400);
      }
    });
  }

  if (btnModalApplyAllNilai) {
    btnModalApplyAllNilai.addEventListener('click', () => {
      const val = document.getElementById('modal-nilai-default').value;
      if (val === '') {
        Swal.fire('Perhatian', 'Masukkan angka nilai (0-100) terlebih dahulu.', 'info');
        return;
      }
      
      const numVal = parseInt(val, 10);
      if (isNaN(numVal) || numVal < 0 || numVal > 100) {
        Swal.fire('Nilai Tidak Valid', 'Nilai harus berupa angka antara 0 hingga 100.', 'warning');
        return;
      }

      // Terapkan ke santri yang sedang tampak / terfilter
      let appliedCount = 0;
      modalNilaiTbody.querySelectorAll('tr.row-santri-nilai').forEach(tr => {
        if (tr.style.display !== 'none') {
          const inp = tr.querySelector('.input-modal-nilai');
          if (inp) {
            inp.value = numVal;
            appliedCount++;
          }
        }
      });

      updateModalNilaiCounters();

      Swal.fire({
        toast: true,
        position: 'top-end',
        icon: 'success',
        title: `Nilai ${numVal} diterapkan ke ${appliedCount} santri`,
        showConfirmButton: false,
        timer: 1500
      });
    });
  }

  if (btnModalSaveNilai) {
    btnModalSaveNilai.addEventListener('click', () => {
      const tipe = document.getElementById('modal-nilai-tipe').value;
      const materi = document.getElementById('modal-nilai-materi').value.trim();

      kbmNilaiState.tipe_nilai = tipe;
      kbmNilaiState.materi = materi;
      kbmNilaiState.nilai_santri = {};

      let filledCount = 0;
      // Ambil seluruh input santri (baik yang tampak maupun yang sedang terfilter)
      modalNilaiTbody.querySelectorAll('.input-modal-nilai').forEach(inp => {
        const sId = inp.getAttribute('data-id');
        const cInp = modalNilaiTbody.querySelector(`.input-modal-catatan[data-id="${sId}"]`);
        const val = inp.value.trim();
        if (val !== '') filledCount++;
        kbmNilaiState.nilai_santri[sId] = {
          nilai: val,
          catatan: cInp ? cInp.value.trim() : ''
        };
      });

      const badge = document.getElementById('badge-nilai-status');
      if (badge) {
        if (filledCount > 0) {
          badge.className = 'badge bg-success text-white ms-1';
          badge.innerText = `${filledCount} Santri Dinilai`;
        } else {
          badge.className = 'badge bg-primary-subtle text-primary ms-1';
          badge.innerText = 'Opsional';
        }
      }

      const modalEl = document.getElementById('modalNilaiKBM');
      if (modalEl) {
        const modalInstance = bootstrap.Modal.getInstance(modalEl);
        if (modalInstance) modalInstance.hide();
      }

      Swal.fire({
        title: 'Penilaian Disimpan',
        text: `${filledCount} santri telah diberikan nilai. Nilai akan otomatis dikirim saat Anda menekan Simpan KBM.`,
        icon: 'success',
        timer: 2000,
        showConfirmButton: false
      });
    });
  }

  // Offline / Online Detection
  const statusIndicator = document.getElementById('online-status');
  function updateOnlineStatus() {
    if(navigator.onLine) {
      statusIndicator.className = 'status-indicator online shadow-sm';
      statusIndicator.innerHTML = '<i class="bi bi-wifi"></i>';
      statusIndicator.title = 'Status Koneksi: Online';
    } else {
      statusIndicator.className = 'status-indicator offline shadow-sm';
      statusIndicator.innerHTML = '<i class="bi bi-wifi-off"></i>';
      statusIndicator.title = 'Status Koneksi: Offline (Tersimpan Lokal)';
    }
  }
  window.addEventListener('online', updateOnlineStatus);
  window.addEventListener('offline', updateOnlineStatus);
  updateOnlineStatus(); // Initial check

  // --- PIN Logic ---
  const validPin = "991588";
  let inputPin = "";
  let pinAttempts = 3;
  let pinModalInstance = null;
  let pinContext = 'save'; // 'save' or 'clock_in'

  const btnSaveAll = document.getElementById('btn-save-all');
  const btnCancelKbm = document.getElementById('btn-cancel-kbm');
  const pinDisplay = document.getElementById('pin-display');
  const pinError = document.getElementById('pin-error');
  const attemptsEl = document.getElementById('pin-attempts');
  const pinPadContainer = document.querySelector('.pin-pad');
  
  const btnJamMasuk = document.getElementById('btn-jam-masuk');
  const btnJamKeluar = document.getElementById('btn-jam-keluar');
  const clockActions = document.getElementById('clock-actions');

  // Initialize Modal
  const pinModalEl = document.getElementById('pinModal');
  if(pinModalEl) {
    pinModalInstance = new bootstrap.Modal(pinModalEl);
    
    // Generate Numpad
    const layout = [1,2,3,4,5,6,7,8,9,'C',0,'OK'];
    layout.forEach(key => {
      const col = document.createElement('div');
      col.className = 'col-4';
      const btn = document.createElement('button');
      btn.innerText = key;
      if (key === 'C') btn.classList.add('text-danger');
      if (key === 'OK') btn.classList.add('text-success');
      
      btn.addEventListener('click', () => handlePinClick(key));
      col.appendChild(btn);
      pinPadContainer.appendChild(col);
    });
  }

  if (btnJamMasuk) {
    btnJamMasuk.addEventListener('click', async () => {
      await doClockIn();
    });
  }

  if (btnJamKeluar) {
    btnJamKeluar.addEventListener('click', async () => {
       await doClockOut();
    });
  }

  if (btnCancelKbm) {
    btnCancelKbm.addEventListener('click', () => {
      Swal.fire({
        title: 'Batalkan Pengisian?',
        text: 'Data yang sudah Anda ketik akan hilang.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Ya, Batal',
        cancelButtonText: 'Tidak'
      }).then((result) => {
        if (result.isConfirmed) {
          resetFormComplete();
        }
      });
    });
  }

  btnSaveAll.addEventListener('click', () => {
    // Validate Jurnal Input before asking PIN
    const materi = document.getElementById('input-materi').value;
    if(!materi.trim()) {
      Swal.fire('Perhatian', 'Materi Pokok / Bahasan Topik wajib diisi!', 'warning');
      return;
    }
    
    // Reset PIN State
    pinContext = 'save';
    inputPin = "";
    updatePinDisplay();
    pinError.classList.add('d-none');
    
    pinModalInstance.show();
  });

  function handlePinClick(key) {
    pinError.classList.add('d-none');
    pinError.classList.remove('animate-shake');

    if (key === 'C') {
      inputPin = inputPin.slice(0, -1);
    } else if (key === 'OK') {
      processPinSubmit();
      return;
    } else {
      if(inputPin.length < 6) inputPin += key;
    }
    updatePinDisplay();
    
    // Auto submit if 6 digits
    if(inputPin.length === 6) {
      setTimeout(processPinSubmit, 200);
    }
  }

  function updatePinDisplay() {
    let display = "";
    for(let i=0; i<6; i++) {
      display += i < inputPin.length ? "•" : "-";
    }
    pinDisplay.innerText = display;
  }

  function processPinSubmit() {
    if(inputPin.length < 6) {
      showPinError("PIN harus 6 digit.");
      return;
    }

    if(inputPin === validPin) {
      // Success
      pinModalInstance.hide();
      if(pinContext === 'save') {
        saveData();
      } else if(pinContext === 'clock_in') {
        doClockIn();
      }
    } else {
      // Failed
      pinAttempts--;
      if(pinAttempts <= 0) {
        pinModalInstance.hide();
        Swal.fire('Akses Diblokir', 'Anda salah memasukkan PIN 3 kali. Form telah direset untuk keamanan.', 'error');
        resetFormComplete();
        pinAttempts = 3; // Reset counter for next time
      } else {
        inputPin = "";
        updatePinDisplay();
        showPinError(`PIN Salah! Kesempatan: ${pinAttempts}`);
      }
    }
  }

  function showPinError(msg) {
    pinError.innerHTML = msg;
    pinError.classList.remove('d-none');
    // trigger animation reflow
    void pinError.offsetWidth;
    pinError.classList.add('animate-shake');
  }

  async function saveData() {
    showLoading(true);
    
    // Here we collect the form data
    const isOffline = !navigator.onLine;

    // Collect Absensi Data & Nilai
    const absensiData = [];
    const tbody = document.getElementById('santri-tbody');
    const rows = tbody.querySelectorAll('tr');
    rows.forEach(tr => {
      const radioChecked = tr.querySelector('input[type="radio"]:checked');
      const inputCatatan = tr.querySelector('td:last-child input');
      
      // Extract ID from radio name (format: abs_{id})
      const santriId = radioChecked ? radioChecked.name.replace('abs_', '') : '';
      const santriObj = currentLoadedSantri.find(s => String(s.id) === String(santriId));
      const sNama = santriObj ? santriObj.nama : '';

      // Check if there is grade in kbmNilaiState
      const nilaiObj = (kbmNilaiState.nilai_santri && kbmNilaiState.nilai_santri[santriId]) || {};
      
      absensiData.push({
        id_santri: santriId,
        nis: santriId,
        nama_santri: sNama,
        kehadiran: radioChecked ? radioChecked.value : 'Hadir',
        nilai: (nilaiObj.nilai !== undefined && nilaiObj.nilai !== null) ? nilaiObj.nilai : '',
        catatan: inputCatatan ? inputCatatan.value : (nilaiObj.catatan || '')
      });
    });

    const payload = {
      action: 'save_kbm',
      id_guru: selGuru.value,
      nama_guru: selGuru.options[selGuru.selectedIndex] ? selGuru.options[selGuru.selectedIndex].text : selGuru.value,
      id_mapel: selMapel.value,
      kelas: selKelas.value,
      jam: selJam.value,
      id_jadwal: selJam.options[selJam.selectedIndex] ? selJam.options[selJam.selectedIndex].getAttribute('data-id') : "",
      materi: document.getElementById('input-materi').value,
      catatan: document.getElementById('input-catatan').value,
      tipe_nilai: kbmNilaiState.tipe_nilai || 'Tugas',
      absensi: absensiData
    };

    if(isOffline) {
      showLoading(false);
      Swal.fire('Tersimpan Offline', 'Anda sedang offline. Data presensi dan jurnal disimpan secara lokal dan akan dikirim saat koneksi pulih.', 'info');
      resetFormComplete();
      pinAttempts = 3;
    } else {
      try {
        const response = await fetch(GAS_URL.replace("get_jadwal_kbm", "save_kbm"), {
          method: 'POST',
          body: JSON.stringify(payload)
        });
        const res = await response.json();
        
        showLoading(false);
        if(res.success) {
          // Update id_jadwal and kelas into activeClockIn
          if(activeClockIn) {
            if(payload.id_jadwal) activeClockIn.id_jadwal = payload.id_jadwal;
            if(payload.kelas) activeClockIn.kelas = payload.kelas;
          }
          
          Swal.fire({
            title: 'Presensi Tercatat!',
            text: 'Data Presensi santri dan Jurnal KBM telah berhasil tersimpan. Sesi mengajar Anda tetap berjalan hingga Anda menekan tombol Jam Keluar saat KBM selesai.',
            icon: 'success',
            confirmButtonText: 'Selesai Input Presensi'
          }).then(() => {
            // Form presensi disembunyikan / direset tanpa mematikan sesi Jam Keluar!
            document.getElementById('content-area').classList.add('d-none');
            if (btnJamKeluar) btnJamKeluar.classList.remove('d-none');
            pinAttempts = 3;
          });
        } else {
          Swal.fire('Gagal', res.message || 'Terjadi kesalahan saat menyimpan.', 'error');
        }
      } catch (err) {
        showLoading(false);
        Swal.fire('Error', 'Gagal mengirim data ke server.', 'error');
        console.error(err);
      }
    }
  }

  async function doClockIn() {
    if (!selGuru.value) {
      Swal.fire('Perhatian', 'Silakan pilih Nama Guru terlebih dahulu.', 'warning');
      return;
    }
    
    showLoading(true);
    const namaGuru = selGuru.options[selGuru.selectedIndex] ? selGuru.options[selGuru.selectedIndex].text : selGuru.value;
    const idJadwal = (selJam && selJam.selectedIndex >= 0 && selJam.options[selJam.selectedIndex]) ? (selJam.options[selJam.selectedIndex].getAttribute('data-id') || '') : '';
    const idMapel = (selMapel && selMapel.value) ? selMapel.value : '';
    const kelas = (selKelas && selKelas.value) ? selKelas.value : '';

    const payload = {
      action: 'clock_in',
      id_guru: selGuru.value,
      nama_guru: namaGuru,
      id_jadwal: idJadwal,
      id_mapel: idMapel,
      kelas: kelas,
      timestamp: new Date().toISOString()
    };
    
    if(!navigator.onLine) {
      showLoading(false);
      Swal.fire('Tersimpan Offline', 'Jam Masuk disimpan lokal.', 'info');
      
      activeClockIn = {
        id_guru: payload.id_guru,
        nama_guru: payload.nama_guru,
        id_jadwal: idJadwal,
        kelas: kelas
      };
      onClockInSuccess();
    } else {
      try {
        const response = await fetch(GAS_URL.replace("get_jadwal_kbm", "clock_in"), {
          method: 'POST',
          body: JSON.stringify(payload)
        });
        const res = await response.json();
        
        showLoading(false);
        if(res.success) {
          Swal.fire('Berhasil', 'Jam Masuk berhasil dicatat.', 'success');
          
          activeClockIn = {
            id_guru: payload.id_guru,
            nama_guru: payload.nama_guru,
            id_jadwal: idJadwal,
            kelas: kelas
          };
          onClockInSuccess();
        } else {
          Swal.fire('Gagal', res.message || 'Terjadi kesalahan.', 'error');
        }
      } catch (err) {
        showLoading(false);
        Swal.fire('Error', 'Gagal menghubungi server.', 'error');
        console.error(err);
      }
    }
  }

  function onClockInSuccess() {
     if(clockActions) clockActions.classList.add('d-none');
     if(btnJamKeluar) btnJamKeluar.classList.remove('d-none');
     selMapel.disabled = false;
     
     jamMasukTime = new Date();
     startProgressBar();
  }
  
  function startProgressBar() {
    const statusMengajar = document.getElementById('status-mengajar');
    const progressMengajar = document.getElementById('progress-mengajar');
    const sisaWaktuText = document.getElementById('sisa-waktu-text');
    const txtWaktuMasuk = document.getElementById('waktu-jam-masuk');
    
    if(!statusMengajar || !jamMasukTime) return;
    
    statusMengajar.classList.remove('d-none');
    
    const h = String(jamMasukTime.getHours()).padStart(2, '0');
    const m = String(jamMasukTime.getMinutes()).padStart(2, '0');
    txtWaktuMasuk.innerText = `${h}:${m}`;

    if (!selJam.value) {
      sisaWaktuText.innerText = "Pilih Jam Pelajaran";
      progressMengajar.style.width = "0%";
      return;
    }

    const timeRegex = /(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})/;
    const match = selJam.value.match(timeRegex);
    
    if(!match) {
      sisaWaktuText.innerText = "Waktu tidak diketahui";
      progressMengajar.style.width = "100%";
      return;
    }
    
    const startTimeStr = match[1];
    const endTimeStr = match[2];
    
    const now = new Date();
    const startTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), parseInt(startTimeStr.split(':')[0]), parseInt(startTimeStr.split(':')[1]), 0);
    const endTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), parseInt(endTimeStr.split(':')[0]), parseInt(endTimeStr.split(':')[1]), 0);
    
    if(endTime < startTime) endTime.setDate(endTime.getDate() + 1);

    if(progressInterval) clearInterval(progressInterval);
    
    const updateProgress = () => {
      const currentTime = new Date();
      const totalDuration = endTime - startTime;
      const elapsed = currentTime - startTime;
      const remaining = endTime - currentTime;
      
      if(remaining <= 0) {
        sisaWaktuText.innerText = "Waktu Habis";
        progressMengajar.style.width = "100%";
        progressMengajar.classList.remove('bg-success');
        progressMengajar.classList.add('bg-danger');
        clearInterval(progressInterval);
      } else if (currentTime < startTime) {
        sisaWaktuText.innerText = "Belum Mulai";
        progressMengajar.style.width = "0%";
      } else {
        const remainingSeconds = Math.floor(remaining / 1000);
        const rm = Math.floor(remainingSeconds / 60);
        const rs = remainingSeconds % 60;
        
        let timeStr = "";
        if(rm > 0) timeStr += `${rm} menit `;
        timeStr += `${rs} detik lagi`;
        
        sisaWaktuText.innerText = timeStr;
        const percentage = (elapsed / totalDuration) * 100;
        progressMengajar.style.width = `${Math.min(100, Math.max(0, percentage))}%`;
        progressMengajar.classList.add('bg-success');
        progressMengajar.classList.remove('bg-danger');
      }
    };
    
    updateProgress();
    progressInterval = setInterval(updateProgress, 1000);
  }

  async function doClockOut() {
    showLoading(true);
    
    // Fallback if not stored in activeClockIn (e.g. page wasn't refreshed but state lost somehow)
    const fallbackNama = selGuru.options[selGuru.selectedIndex] ? selGuru.options[selGuru.selectedIndex].text : selGuru.value;
    const fallbackJadwal = selJam.options[selJam.selectedIndex] ? selJam.options[selJam.selectedIndex].getAttribute('data-id') : "";
    const fallbackKelas = selKelas.value || "";
    
    const payload = {
      action: 'clock_out',
      id_guru: activeClockIn ? activeClockIn.id_guru : selGuru.value,
      nama_guru: activeClockIn ? activeClockIn.nama_guru : fallbackNama,
      id_jadwal: (activeClockIn && activeClockIn.id_jadwal) ? activeClockIn.id_jadwal : fallbackJadwal,
      kelas: (activeClockIn && activeClockIn.kelas) ? activeClockIn.kelas : fallbackKelas,
      timestamp: new Date().toISOString()
    };
    
    if(!navigator.onLine) {
      showLoading(false);
      Swal.fire('Tersimpan Offline', 'Jam Keluar disimpan lokal.', 'info');
      if(btnJamKeluar) btnJamKeluar.classList.add('d-none');
    } else {
      try {
        const fetchUrl = GAS_URL.replace("get_jadwal_kbm", "clock_out");
        const response = await fetch(fetchUrl, {
          method: 'POST',
          body: JSON.stringify(payload)
        });
        const res = await response.json();
        
        showLoading(false);
        if(res.success) {
          Swal.fire('Berhasil', 'Jam Keluar berhasil dicatat.', 'success');
          if(btnJamKeluar) btnJamKeluar.classList.add('d-none');
          
          // Matikan progress bar
          const statusMengajar = document.getElementById('status-mengajar');
          if(statusMengajar) statusMengajar.classList.add('d-none');
          if(progressInterval) clearInterval(progressInterval);
          jamMasukTime = null;
          
        } else {
          Swal.fire('Gagal', res.message || 'Terjadi kesalahan.', 'error');
        }
      } catch (err) {
        showLoading(false);
        Swal.fire('Error', 'Gagal menghubungi server.', 'error');
        console.error(err);
      }
    }
  }

  function resetFormComplete() {
    document.getElementById('input-materi').value = '';
    document.getElementById('input-catatan').value = '';
    document.getElementById('content-area').classList.add('d-none');
    
    // Reset filters
    selMapel.selectedIndex = 0;
    selKelas.selectedIndex = 0;
    selJam.selectedIndex = 0;
    selMapel.disabled = true;
    selKelas.disabled = true;
    selJam.disabled = true;
    btnLoad.disabled = true;
    selGuru.selectedIndex = 0;
    
    clearSessionState();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // Fullscreen Logic
  const btnFullscreen = document.getElementById('btn-fullscreen');
  if(btnFullscreen) {
    btnFullscreen.addEventListener('click', () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(err => {
          console.log(`Error attempting to enable fullscreen: ${err.message}`);
        });
        btnFullscreen.innerHTML = '<i class="bi bi-fullscreen-exit text-primary"></i>';
      } else {
        document.exitFullscreen();
        btnFullscreen.innerHTML = '<i class="bi bi-arrows-fullscreen text-secondary"></i>';
      }
    });
  }

  // --- Clock Logic ---
  const clockDisplay = document.getElementById('clock-display');
  function updateClock() {
    if(!clockDisplay) return;
    const now = new Date();
    const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
    
    const dayName = days[now.getDay()];
    const date = String(now.getDate()).padStart(2, '0');
    const monthName = months[now.getMonth()];
    const year = now.getFullYear();
    const h = String(now.getHours()).padStart(2, '0');
    const m = String(now.getMinutes()).padStart(2, '0');
    const s = String(now.getSeconds()).padStart(2, '0');
    
    // Format: hari, jam tanggal-bulan-tahun
    clockDisplay.innerText = `${dayName}, ${h}:${m}:${s} | ${date}-${monthName}-${year}`;
    
    // Update lock screen clock if visible
    const lockClockTime = document.getElementById('lock-clock-time');
    if (lockClockTime) {
      lockClockTime.innerText = `${h}:${m}:${s}`;
    }
  }
  setInterval(updateClock, 1000);
  updateClock();

  // ================================================================
  // KBM SESSION PERSISTENCE & LOCK SCREEN ENGINE
  // ================================================================
  const STORAGE_KEY = 'maisya_kbm_pwa_session_v1';
  const lockOverlay = document.getElementById('kbm-lock-overlay');
  const btnLockScreen = document.getElementById('btn-lock-screen');
  const btnUnlockKbm = document.getElementById('btn-unlock-kbm');

  function isLockScreenActive() {
    return lockOverlay && !lockOverlay.classList.contains('d-none');
  }

  function saveSessionState(isLocked) {
    try {
      const configSec = document.getElementById('config-section');
      const contentSec = document.getElementById('content-area');
      const logSec = document.getElementById('log-section');
      const dashboardSec = document.getElementById('dashboard-section');

      const isConfigVisible = configSec && !configSec.classList.contains('d-none');
      const isContentVisible = contentSec && !contentSec.classList.contains('d-none');
      const isLogVisible = logSec && !logSec.classList.contains('d-none');

      // Do not save if at empty dashboard
      if (!selGuru.value && !activeClockIn && !isContentVisible && !isConfigVisible) {
        return;
      }

      // Collect student checks
      const absensiDraft = {};
      const tbody = document.getElementById('santri-tbody');
      if (tbody) {
        const rows = tbody.querySelectorAll('tr');
        rows.forEach(tr => {
          const radioChecked = tr.querySelector('input[type="radio"]:checked');
          const inputCatatan = tr.querySelector('td:last-child input');
          const santriId = radioChecked ? radioChecked.name.replace('abs_', '') : '';
          if (santriId) {
            absensiDraft[santriId] = {
              status: radioChecked ? radioChecked.value : 'Hadir',
              catatan: inputCatatan ? inputCatatan.value : ''
            };
          }
        });
      }

      const state = {
        view: isContentVisible ? 'content' : (isConfigVisible ? 'config' : (isLogVisible ? 'log' : 'dashboard')),
        id_guru: selGuru ? selGuru.value : '',
        id_mapel: selMapel ? selMapel.value : '',
        kelas: selKelas ? selKelas.value : '',
        jam: selJam ? selJam.value : '',
        id_jadwal: (selJam && selJam.selectedIndex >= 0 && selJam.options[selJam.selectedIndex]) ? selJam.options[selJam.selectedIndex].getAttribute('data-id') : '',
        activeClockIn: activeClockIn || null,
        jamMasukTimeStr: jamMasukTime ? jamMasukTime.toISOString() : null,
        materi: document.getElementById('input-materi') ? document.getElementById('input-materi').value : '',
        catatan: document.getElementById('input-catatan') ? document.getElementById('input-catatan').value : '',
        absensiDraft: absensiDraft,
        kbmNilaiState: kbmNilaiState || null,
        isLocked: (typeof isLocked === 'boolean') ? isLocked : isLockScreenActive(),
        savedAt: new Date().toISOString()
      };

      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch(e) {
      console.warn("Gagal menyimpan state KBM:", e);
    }
  }

  function restoreSessionState() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) return false;
      const state = JSON.parse(saved);
      if (!state || !state.id_guru) return false;

      // Check if session is from today (prevent yesterday stale state)
      const savedDate = state.savedAt ? state.savedAt.split('T')[0] : '';
      const todayStr = new Date().toISOString().split('T')[0];
      if (savedDate && savedDate !== todayStr) {
        localStorage.removeItem(STORAGE_KEY);
        return false;
      }

      // Restore Guru dropdown
      if (selGuru) selGuru.value = state.id_guru;
      updateMapel();

      setTimeout(() => {
        if (state.id_mapel && selMapel) selMapel.value = state.id_mapel;
        updateKelas();

        setTimeout(() => {
          if (state.kelas && selKelas) selKelas.value = state.kelas;
          updateJam();

          setTimeout(() => {
            if (state.jam && selJam) {
              for (let i = 0; i < selJam.options.length; i++) {
                if (selJam.options[i].value === state.jam || selJam.options[i].value.includes(state.jam)) {
                  selJam.selectedIndex = i;
                  break;
                }
              }
            }

            if (selJam && selJam.value) btnLoad.disabled = false;

            // Restore Clock-In
            if (state.activeClockIn || state.jamMasukTimeStr) {
              activeClockIn = state.activeClockIn || { id_guru: state.id_guru, nama_guru: state.nama_guru || state.id_guru };
              if (state.jamMasukTimeStr) jamMasukTime = new Date(state.jamMasukTimeStr);
              if (clockActions) clockActions.classList.add('d-none');
              if (btnJamKeluar) btnJamKeluar.classList.remove('d-none');
              if (selMapel) selMapel.disabled = false;
              startProgressBar();
            }

            // Restore View & Sections
            if (state.view === 'config' || state.view === 'content') {
              const dashSec = document.getElementById('dashboard-section');
              const confSec = document.getElementById('config-section');
              const welc = document.getElementById('welcome-header');
              const mainNav = document.getElementById('main-nav-container');

              if (dashSec) dashSec.classList.add('d-none');
              if (confSec) confSec.classList.remove('d-none');
              if (welc) welc.classList.add('d-none');
              if (mainNav) mainNav.classList.add('d-none');
            }

            if (state.view === 'content') {
              // Trigger Santri Loading & Populate
              if (btnLoad) {
                btnLoad.click();
              }
              
              setTimeout(() => {
                const inpMateri = document.getElementById('input-materi');
                const inpCatatan = document.getElementById('input-catatan');
                if (inpMateri && state.materi) inpMateri.value = state.materi;
                if (inpCatatan && state.catatan) inpCatatan.value = state.catatan;
                if (state.kbmNilaiState) kbmNilaiState = state.kbmNilaiState;

                // Restore individual checks & notes
                if (state.absensiDraft) {
                  for (let sId in state.absensiDraft) {
                    const item = state.absensiDraft[sId];
                    const radio = document.querySelector(`input[name="abs_${sId}"][value="${item.status}"]`);
                    if (radio) radio.checked = true;
                    const inpNote = document.getElementById(`catatan_${sId}`);
                    if (inpNote && item.catatan) inpNote.value = item.catatan;
                  }
                }
              }, 1000);
            }

            if (state.isLocked) {
              showLockScreen(false);
            }
          }, 60);
        }, 60);
      }, 60);

      return true;
    } catch(e) {
      console.warn("Gagal me-restore state KBM:", e);
      return false;
    }
  }

  function clearSessionState() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch(e) {}
  }

  function showLockScreen(save = true) {
    if (!lockOverlay) return;
    
    // Populate session details into lock screen
    const guruNama = selGuru && selGuru.selectedIndex >= 0 && selGuru.options[selGuru.selectedIndex]
      ? selGuru.options[selGuru.selectedIndex].text 
      : (activeClockIn ? activeClockIn.nama_guru : '-');
    const mapelNama = selMapel && selMapel.selectedIndex >= 0 && selMapel.options[selMapel.selectedIndex]
      ? selMapel.options[selMapel.selectedIndex].text 
      : '-';
    const kelasNama = selKelas ? selKelas.value : '-';
    
    const lockInfoGuru = document.getElementById('lock-info-guru');
    const lockInfoMapel = document.getElementById('lock-info-mapel');
    const lockInfoStatus = document.getElementById('lock-info-status');
    const lockInfoProgress = document.getElementById('lock-info-progress');

    if (lockInfoGuru) lockInfoGuru.innerText = (guruNama && !guruNama.includes('--')) ? guruNama : 'Belum Dipilih';
    if (lockInfoMapel) lockInfoMapel.innerText = (mapelNama && !mapelNama.includes('--')) ? `${mapelNama} (${kelasNama || '-'})` : 'Belum Ada Sesi';
    
    if (lockInfoStatus) {
      if (activeClockIn || jamMasukTime) {
        lockInfoStatus.className = 'badge bg-success';
        lockInfoStatus.innerText = 'Jam Masuk Aktif';
      } else {
        lockInfoStatus.className = 'badge bg-secondary';
        lockInfoStatus.innerText = 'Belum Jam Masuk';
      }
    }

    if (lockInfoProgress) {
      const tbody = document.getElementById('santri-tbody');
      if (tbody) {
        const rows = tbody.querySelectorAll('tr');
        const checked = tbody.querySelectorAll('input[type="radio"]:checked').length;
        lockInfoProgress.innerText = rows.length > 0 ? `${checked} / ${rows.length} Santri` : '-';
      } else {
        lockInfoProgress.innerText = '-';
      }
    }

    lockOverlay.classList.remove('d-none');
    if (save) saveSessionState(true);
  }

  function hideLockScreen() {
    if (!lockOverlay) return;
    lockOverlay.classList.add('d-none');
    saveSessionState(false);
  }

  if (btnLockScreen) {
    btnLockScreen.addEventListener('click', () => showLockScreen(true));
  }
  if (btnUnlockKbm) {
    btnUnlockKbm.addEventListener('click', () => hideLockScreen());
  }

  // Hook auto-save on inputs
  const inpMateriEl = document.getElementById('input-materi');
  const inpCatatanEl = document.getElementById('input-catatan');
  if (inpMateriEl) inpMateriEl.addEventListener('input', () => saveSessionState());
  if (inpCatatanEl) inpCatatanEl.addEventListener('input', () => saveSessionState());
  if (selGuru) selGuru.addEventListener('change', () => saveSessionState());
  if (selMapel) selMapel.addEventListener('change', () => saveSessionState());
  if (selKelas) selKelas.addEventListener('change', () => saveSessionState());
  if (selJam) selJam.addEventListener('change', () => saveSessionState());

  // Listeners for page visibility & screen lock
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      saveSessionState(false);
    } else if (document.visibilityState === 'visible') {
      if (jamMasukTime) startProgressBar();
      updateClock();
    }
  });

  window.addEventListener('pagehide', () => saveSessionState(false));
  window.addEventListener('pageshow', () => {
    if (jamMasukTime) startProgressBar();
  });

  // Check and show install banner on start if not standalone & not dismissed
  setTimeout(() => {
    const isStandaloneMode = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    const banner = document.getElementById('pwa-install-banner');
    if (banner && !sessionStorage.getItem('pwa_banner_dismissed') && !isStandaloneMode) {
      banner.classList.remove('d-none');
    }
  }, 1200);

});

// ==================== PWA INSTALLATION MANAGER ====================
let deferredPwaPrompt = null;
const isAppStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

window.addEventListener('beforeinstallprompt', (e) => {
  // Prevent default mini-infobar or auto-prompt
  e.preventDefault();
  // Stash the event so it can be triggered later
  deferredPwaPrompt = e;
  console.log('[PWA] beforeinstallprompt event captured successfully!');
  
  const btnInstall = document.getElementById('btn-install-pwa');
  if (btnInstall) {
    btnInstall.classList.remove('d-none');
  }
  
  const banner = document.getElementById('pwa-install-banner');
  if (banner && !sessionStorage.getItem('pwa_banner_dismissed') && !isAppStandalone) {
    banner.classList.remove('d-none');
  }
});

window.addEventListener('appinstalled', () => {
  console.log('[PWA] App successfully installed!');
  deferredPwaPrompt = null;
  const btnInstall = document.getElementById('btn-install-pwa');
  if (btnInstall) {
    btnInstall.innerHTML = '<i class="bi bi-check-circle-fill text-success"></i> <span class="d-none d-sm-inline text-success">Terpasang</span>';
    btnInstall.classList.remove('btn-outline-primary');
    btnInstall.classList.add('btn-light');
  }
  const banner = document.getElementById('pwa-install-banner');
  if (banner) banner.classList.add('d-none');
  
  if (typeof Swal !== 'undefined') {
    Swal.fire({
      title: 'Aplikasi Terpasang!',
      text: 'Presensi KBM kini telah terpasang di layar utama perangkat Anda.',
      icon: 'success',
      timer: 3000,
      showConfirmButton: false
    });
  }
});

window.triggerPwaInstall = async function() {
  if (isAppStandalone) {
    if (typeof Swal !== 'undefined') {
      Swal.fire({
        title: 'Aplikasi Sudah Terpasang',
        text: 'Anda sedang membuka Presensi KBM dalam mode aplikasi mandiri (PWA).',
        icon: 'info',
        confirmButtonText: 'OK'
      });
    } else {
      alert('Aplikasi sudah terpasang di perangkat Anda.');
    }
    return;
  }

  if (deferredPwaPrompt) {
    try {
      deferredPwaPrompt.prompt();
      const choiceResult = await deferredPwaPrompt.userChoice;
      console.log('[PWA] User choice outcome:', choiceResult.outcome);
      if (choiceResult.outcome === 'accepted') {
        deferredPwaPrompt = null;
        const banner = document.getElementById('pwa-install-banner');
        if (banner) banner.classList.add('d-none');
      }
    } catch(err) {
      console.warn('[PWA] Native prompt error, showing guide modal:', err);
      openPwaInstallGuideModal();
    }
  } else {
    // Fallback: show interactive modal guide for browser without native prompt
    openPwaInstallGuideModal();
  }
};

window.tryNativeInstallPrompt = async function() {
  if (deferredPwaPrompt) {
    try {
      deferredPwaPrompt.prompt();
      const choiceResult = await deferredPwaPrompt.userChoice;
      if (choiceResult.outcome === 'accepted') {
        deferredPwaPrompt = null;
        const modalEl = document.getElementById('modalPwaInstallGuide');
        if (modalEl) {
          const bsModal = bootstrap.Modal.getInstance(modalEl);
          if (bsModal) bsModal.hide();
        }
      }
    } catch(e) {
      console.error(e);
    }
  } else {
    if (typeof Swal !== 'undefined') {
      Swal.fire({
        title: 'Browser Tidak Mendukung Pemasangan Otomatis',
        text: 'Silakan ikuti 3 langkah manual di atas sesuai browser/perangkat yang Anda gunakan.',
        icon: 'info',
        confirmButtonText: 'Saya Mengerti'
      });
    } else {
      alert('Silakan ikuti petunjuk manual di atas untuk browser Anda.');
    }
  }
};

window.dismissPwaBanner = function() {
  const banner = document.getElementById('pwa-install-banner');
  if (banner) banner.classList.add('d-none');
  sessionStorage.setItem('pwa_banner_dismissed', 'true');
};

function detectPwaPlatform() {
  const ua = navigator.userAgent || navigator.vendor || window.opera || '';
  if (/iPad|iPhone|iPod/.test(ua) && !window.MSStream) {
    return 'ios';
  } else if (/Android/.test(ua)) {
    return 'android';
  }
  return 'desktop';
}

window.openPwaInstallGuideModal = function() {
  const modalEl = document.getElementById('modalPwaInstallGuide');
  if (!modalEl) return;
  
  const platform = detectPwaPlatform();
  
  // Activate platform tab
  const tabAndroid = document.getElementById('tab-pwa-android');
  const tabIos = document.getElementById('tab-pwa-ios');
  const tabDesktop = document.getElementById('tab-pwa-desktop');
  const paneAndroid = document.getElementById('pane-pwa-android');
  const paneIos = document.getElementById('pane-pwa-ios');
  const paneDesktop = document.getElementById('pane-pwa-desktop');
  
  [tabAndroid, tabIos, tabDesktop].forEach(t => { if(t) t.classList.remove('active'); });
  [paneAndroid, paneIos, paneDesktop].forEach(p => { if(p) p.classList.remove('show', 'active'); });
  
  if (platform === 'ios') {
    if (tabIos) tabIos.classList.add('active');
    if (paneIos) paneIos.classList.add('show', 'active');
  } else if (platform === 'android') {
    if (tabAndroid) tabAndroid.classList.add('active');
    if (paneAndroid) paneAndroid.classList.add('show', 'active');
  } else {
    if (tabDesktop) tabDesktop.classList.add('active');
    if (paneDesktop) paneDesktop.classList.add('show', 'active');
  }
  
  const bsModal = bootstrap.Modal.getOrCreateInstance(modalEl);
  bsModal.show();
};

// Check if opened inside In-App Browser (WhatsApp, Telegram, Line, FB, IG Webview)
function isInAppBrowser() {
  const ua = navigator.userAgent || navigator.vendor || window.opera || '';
  return (ua.indexOf('FBAN') > -1) || 
         (ua.indexOf('FBAV') > -1) || 
         (ua.indexOf('Instagram') > -1) || 
         (ua.indexOf('Line') > -1) || 
         (ua.indexOf('WhatsApp') > -1) ||
         (ua.indexOf('Telegram') > -1) ||
         (ua.indexOf('MicroMessenger') > -1);
}

document.addEventListener('DOMContentLoaded', () => {
  if (isInAppBrowser() && !sessionStorage.getItem('inapp_warned')) {
    setTimeout(() => {
      sessionStorage.setItem('inapp_warned', '1');
      if (typeof Swal !== 'undefined') {
        Swal.fire({
          title: 'Buka di Browser Utama',
          html: 'Anda sedang membuka Presensi KBM melalui browser internal chat.<br><br>Untuk pengalaman terbaik & menyimpan ke layar utama HP, silakan ketuk menu titik tiga (<b>⋮</b>) di pojok kanan atas lalu pilih <b>"Buka di Browser / Chrome / Safari"</b>.',
          icon: 'info',
          confirmButtonText: 'Baik, Saya Mengerti'
        });
      }
    }, 1500);
  }
});

