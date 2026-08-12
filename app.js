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
      } else {
        Swal.fire('Error', 'Gagal memuat data jadwal dari server.', 'error');
      }
    } catch (e) {
      console.error(e);
      Swal.fire('Offline', 'Tidak dapat terhubung ke server (Offline Mode). Data jadwal tidak dapat dimuat.', 'warning');
      selGuru.innerHTML = '<option value="" selected disabled>-- Offline --</option>';
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

    // Initial draw
    drawDashboardTable();
  }

  function drawDashboardTable() {
    const tbody = document.getElementById('body-jadwal-dashboard');
    if (!tbody) return;

    const filterHariVal = document.getElementById('filter-hari') ? document.getElementById('filter-hari').value : 'Semua Hari';
    const filterJamVal = document.getElementById('filter-jam') ? document.getElementById('filter-jam').value : 'Semua Jam';
    const filterKelasVal = document.getElementById('filter-kelas') ? document.getElementById('filter-kelas').value : 'Semua Kelas';

    let filtered = allJadwal;

    if (filterHariVal !== 'Semua Hari') {
      filtered = filtered.filter(j => String(j.Hari).toLowerCase() === String(filterHariVal).toLowerCase());
    }
    
    if (filterKelasVal !== 'Semua Kelas') {
      filtered = filtered.filter(j => String(j.Kelas) === String(filterKelasVal));
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
  
  const filterTanggalLog = document.getElementById('filter-tanggal-log');
  const btnRefreshLog = document.getElementById('btn-refresh-log');
  const tbodyLog = document.getElementById('body-log');

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
        // Initialize date and fetch if empty
        if(!filterTanggalLog.value) {
           filterTanggalLog.value = new Date().toISOString().split('T')[0];
           fetchLogKbm();
        }
      }
    });
  }

  if (filterTanggalLog) filterTanggalLog.addEventListener('change', fetchLogKbm);
  if (btnRefreshLog) btnRefreshLog.addEventListener('click', fetchLogKbm);

  async function fetchLogKbm() {
    if (!filterTanggalLog || !filterTanggalLog.value) return;
    
    tbodyLog.innerHTML = `<tr><td colspan="10" class="text-center py-5 text-muted"><div class="spinner-border spinner-border-sm text-primary me-2" role="status"></div> Memuat log presensi...</td></tr>`;
    showLoading(true);

    try {
      const payload = { action: 'get_log_kbm', tanggal: filterTanggalLog.value };
      
      const response = await fetch("https://script.google.com/macros/s/AKfycbxWjwlc6-mXpOimodZMFvQIC8hwdGRAz78PqnYIfQgSuXKkI9fUP4hXfC5x3QUIypiT/exec?action=get_log_kbm", {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload)
      });
      const res = await response.json();
      
      if(res.success) {
        renderLogTable(res.data);
      } else {
        Swal.fire('Error', res.message || 'Gagal memuat log.', 'error');
        tbodyLog.innerHTML = `<tr><td colspan="10" class="text-center py-5 text-danger">Gagal memuat log presensi.</td></tr>`;
      }
    } catch(e) {
       console.error(e);
       Swal.fire('Error', 'Terjadi kesalahan jaringan.', 'error');
       tbodyLog.innerHTML = `<tr><td colspan="10" class="text-center py-5 text-danger">Terjadi kesalahan jaringan.</td></tr>`;
    } finally {
       showLoading(false);
    }
  }

  function renderLogTable(data) {
    if (!data || data.length === 0) {
      tbodyLog.innerHTML = `<tr><td colspan="11" class="text-center py-5 text-muted"><div class="text-center mb-3"><i class="bi bi-calendar2-x display-4 text-light"></i></div>Tidak ada jadwal KBM pada hari ini.</td></tr>`;
      return;
    }

    tbodyLog.innerHTML = '';
    data.forEach((item, index) => {
      window.santriDetailsCache = window.santriDetailsCache || {};
      if (item.status_isi && item.catatan_santri) {
         window.santriDetailsCache[item.id_jurnal] = item.catatan_santri;
      }

      let badgeMasuk = '';
      if (item.status_isi) {
         if (item.late_mins > 0) {
            badgeMasuk = `<div class="mt-1"><span class="badge bg-danger rounded-pill" style="font-size: 0.7rem;">Terlambat ${item.late_mins} mnt</span></div>`;
         } else {
            badgeMasuk = `<div class="mt-1"><span class="badge bg-success rounded-pill" style="font-size: 0.7rem;">Tepat waktu</span></div>`;
         }
      }

      let badgeKeluar = '';
      if (item.status_isi) {
         if (item.jam_ke !== '-') {
            if (item.over_mins > 0) {
               badgeKeluar = `<div class="mt-1"><span class="badge bg-warning text-dark rounded-pill" style="font-size: 0.7rem;">Lebih ${item.over_mins} mnt</span></div>`;
            }
         } else {
            badgeKeluar = `<div class="mt-1"><span class="badge bg-danger rounded-pill" style="font-size: 0.7rem;">Tidak mengisi</span></div>`;
         }
      }
      
      let statusHtml = '';
      if (item.status_isi) {
          statusHtml = `<span class="badge bg-success"><i class="bi bi-check-circle me-1"></i>Hadir</span>`;
      } else {
          statusHtml = `<span class="badge bg-secondary text-light"><i class="bi bi-dash-circle me-1"></i>Belum mengisi</span>`;
      }

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="fw-medium">${item.no}</td>
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
           <div class="fw-medium small">${item.materi}</div>
           <div class="text-muted small fst-italic mt-1">${item.catatan_kelas}</div>
        </td>
        <td>
           ${item.status_isi ? `<div class="d-flex gap-1 justify-content-center">
             <button class="btn btn-sm btn-outline-primary rounded-pill py-0 px-2 btn-edit-log" data-id="${item.id_jurnal}" title="Edit Log">
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

    // Bind edit buttons
    document.querySelectorAll('.btn-edit-log').forEach(btn => {
       btn.addEventListener('click', (e) => {
          Swal.fire({
            title: 'Info Edit',
            text: 'Untuk saat ini, jika ada kesalahan input KBM, silakan Hapus log ini menggunakan PIN Admin, kemudian isi ulang presensi.',
            icon: 'info'
          });
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

  window.showDetailSantriModal = function(idJurnal, filterStatus) {
      if (!idJurnal || idJurnal === 'undefined') return;
      
      const santriData = window.santriDetailsCache ? window.santriDetailsCache[idJurnal] : null;
      let html = '<div class="text-center py-3 text-muted">Data tidak ditemukan.</div>';
      let modalTitle = 'Detail Catatan Santri';
      
      if (santriData && santriData.length > 0) {
         const filtered = santriData.filter(c => String(c.status || 'Hadir').toLowerCase().includes(filterStatus.toLowerCase()));
         if (filtered.length > 0) {
            let lis = filtered.map(c => {
                let text = `<strong>${c.nama}</strong>: `;
                let stColor = 'secondary';
                let stStr = String(c.status || 'Hadir').toLowerCase();
                if(stStr.includes('hadir')) stColor = 'success';
                else if(stStr.includes('izin')) stColor = 'warning text-dark';
                else if(stStr.includes('sakit')) stColor = 'info text-dark';
                else if(stStr.includes('alfa')) stColor = 'danger';
                
                text += `<span class="badge bg-${stColor} ms-1">${c.status || 'Hadir'}</span>`;
                if(c.nilai) text += `<span class="badge bg-primary ms-1">Nilai: ${c.nilai}</span>`;
                if(c.catatan) text += `<span class="text-muted ms-1 fst-italic">"${c.catatan}"</span>`;
                return `<li class="mb-2 pb-2 border-bottom">${text}</li>`;
            }).join('');
            html = `<ul class="list-unstyled mb-0">${lis}</ul>`;
            modalTitle = `Detail Santri : ${filterStatus} (${filtered.length} Santri)`;
         } else {
            html = `<div class="text-center py-3 text-muted">Tidak ada santri dengan status ${filterStatus}.</div>`;
            modalTitle = `Detail Santri : ${filterStatus}`;
         }
      }
      
      const body = document.getElementById('modal-detail-santri-body');
      if (body) body.innerHTML = html;
      
      const titleEl = document.getElementById('modal-detail-santri-title');
      if (titleEl) titleEl.innerText = modalTitle;
      
      const myModal = new bootstrap.Modal(document.getElementById('modal-detail-santri'));
      myModal.show();
  };

  function confirmDeleteLog(idJurnal) {
    Swal.fire({
      title: 'Hapus Log?',
      text: 'Masukkan PIN Admin untuk menghapus log presensi dan jurnal ini.',
      input: 'password',
      inputAttributes: {
        autocapitalize: 'off',
        autocorrect: 'off'
      },
      showCancelButton: true,
      confirmButtonText: 'Hapus',
      cancelButtonText: 'Batal',
      showLoaderOnConfirm: true,
      preConfirm: async (pin) => {
        if (pin !== 'admin991588') {
          Swal.showValidationMessage('PIN salah!');
          return false;
        }
        
        try {
          const payload = { action: 'delete_log_kbm', id_jurnal: idJurnal };
          const response = await fetch("https://script.google.com/macros/s/AKfycbxWjwlc6-mXpOimodZMFvQIC8hwdGRAz78PqnYIfQgSuXKkI9fUP4hXfC5x3QUIypiT/exec", {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(payload)
          });
          const res = await response.json();
          if (!res.success) {
            throw new Error(res.message || 'Gagal menghapus log.');
          }
          return res;
        } catch (error) {
          Swal.showValidationMessage(`Request failed: ${error}`);
        }
      },
      allowOutsideClick: () => !Swal.isLoading()
    }).then((result) => {
      if (result.isConfirmed) {
        Swal.fire('Terhapus!', 'Log presensi berhasil dihapus.', 'success');
        fetchLogKbm(); // Refresh table
      }
    });
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

  // Load Santri
  btnLoad.addEventListener('click', () => {
    if(!selGuru.value || !selKelas.value) return;
    
    showLoading(true);
    
    const selectedKelasName = selKelas.value;
    
    // Filter santri asli dari database berdasarkan kelas
    let generatedSantri = allSantri.filter(s => String(s.kelas) === String(selectedKelasName) || String(s.Kelas) === String(selectedKelasName));
    
    // Jika tidak ada santri ditemukan, berikan fallback (opsional, tapi sebaiknya kosong saja)
    if(generatedSantri.length === 0) {
      console.warn("Tidak ada santri ditemukan untuk kelas " + selectedKelasName);
    }
    
    // Format data santri agar sesuai dengan fungsi renderSantri (butuh id dan nama)
    const formattedSantri = generatedSantri.map((s, i) => ({
      id: s.id_santri || s.ID_Santri || s.nis || `S${i}`,
      nama: s.nama || s.Nama_Lengkap || s.nama_santri || s.Nama || 'Santri Tidak Dikenal'
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

  function renderSantri(data) {
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
        <td>
          <input type="number" class="form-control form-control-sm text-center bg-light input-nilai-santri" placeholder="0-100" min="0" max="100" id="nilai_${s.id}">
        </td>
        <td class="pe-4">
          <input type="text" class="form-control form-control-sm bg-light" placeholder="Keterangan..." id="catatan_${s.id}">
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  // Set Nilai Semua Event
  const inputDefaultNilai = document.getElementById('input-default-nilai');
  if(inputDefaultNilai) {
    inputDefaultNilai.addEventListener('input', (e) => {
      const val = e.target.value;
      const allNilaiInputs = document.querySelectorAll('.input-nilai-santri');
      allNilaiInputs.forEach(input => {
        input.value = val;
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
      // Here we would typically sync pending offline data
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

    // Collect Absensi Data
    const absensiData = [];
    const tbody = document.getElementById('santri-tbody');
    const rows = tbody.querySelectorAll('tr');
    rows.forEach(tr => {
      const radioChecked = tr.querySelector('input[type="radio"]:checked');
      const inputNilai = tr.querySelector('.input-nilai-santri');
      const inputCatatan = tr.querySelector('td:last-child input');
      
      // Extract ID from radio name (format: abs_{id})
      const santriId = radioChecked ? radioChecked.name.replace('abs_', '') : '';
      
      absensiData.push({
        id_santri: santriId,
        kehadiran: radioChecked ? radioChecked.value : 'Hadir',
        nilai: inputNilai ? inputNilai.value : '',
        catatan: inputCatatan ? inputCatatan.value : ''
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
      absensi: absensiData
    };

    if(isOffline) {
      showLoading(false);
      // Save to localStorage (dummy logic as before)
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
          // Update id_jadwal and kelas into activeClockIn BEFORE form is reset so doClockOut can use it
          if(activeClockIn) {
            if(payload.id_jadwal) activeClockIn.id_jadwal = payload.id_jadwal;
            if(payload.kelas) activeClockIn.kelas = payload.kelas;
          }
          
          Swal.fire('Berhasil!', 'Data Presensi dan Jurnal Mengajar telah tersimpan ke database.', 'success').then(() => {
            resetFormComplete();
            pinAttempts = 3;
            // Otomatis menekan tombol keluar
            doClockOut();
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
    const payload = {
      action: 'clock_in',
      id_guru: selGuru.value,
      nama_guru: namaGuru,
      timestamp: new Date().toISOString()
    };
    
    if(!navigator.onLine) {
      showLoading(false);
      Swal.fire('Tersimpan Offline', 'Jam Masuk disimpan lokal.', 'info');
      
      activeClockIn = {
        id_guru: payload.id_guru,
        nama_guru: payload.nama_guru
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
            nama_guru: payload.nama_guru
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
  }
  setInterval(updateClock, 1000);
  updateClock();

});
