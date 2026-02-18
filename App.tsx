import React, { useState, useMemo, useEffect, useRef } from 'react';
import { ViewType, ArtAsset, UserHolding, Transaction, InsuranceStatus, GalleryItem } from './types';
import { MOCK_ASSETS } from './constants';
import InsuranceBadge from './components/InsuranceBadge';
import AssetCard from './components/AssetCard';
import GuaranteeBar from './components/GuaranteeBar';
import LoginScreen from './components/LoginScreen';
import { supabase } from './supabaseClient';

const App: React.FC = () => {
  // Auth State
  const [isAuthenticated, setIsAuthenticated] = useState(true);
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);
  
  const [currentView, setCurrentView] = useState<ViewType>('HOME');
  const [selectedAsset, setSelectedAsset] = useState<ArtAsset | null>(null);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  
  // Security / PIN States
  const [lockingAsset, setLockingAsset] = useState<ArtAsset | null>(null);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const [pinValue, setPinValue] = useState('');
  const [pinError, setPinError] = useState(false);
  const [isSecurityUnlocked, setIsSecurityUnlocked] = useState(false); 

  // Admin Login State
  const [adminPwdInput, setAdminPwdInput] = useState('');
  const [adminLoginError, setAdminLoginError] = useState(false);

  // File Input Refs
  const mainImageInputRef = useRef<HTMLInputElement>(null);
  const galleryImageInputRef = useRef<HTMLInputElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const tokenizeImageInputRef = useRef<HTMLInputElement>(null);

  // Simulation State for Gallery
  const [gallerySimulations, setGallerySimulations] = useState<Record<string, number>>({});

  // Purchase Flow State
  const [purchaseAsset, setPurchaseAsset] = useState<any | null>(null);
  
  // Deposit and Withdraw States
  const [isDepositModalOpen, setIsDepositModalOpen] = useState(false);
  const [isWithdrawModalOpen, setIsWithdrawModalOpen] = useState(false);
  const [transactionAmount, setTransactionAmount] = useState('');

  // Admin States
  const [editorData, setEditorData] = useState<Partial<ArtAsset>>({});
  const [assets, setAssets] = useState<ArtAsset[]>([]);

  // Tokenization State
  const [tokenizeData, setTokenizeData] = useState({
    title: '',
    artist: '',
    year: '',
    estimatedValue: '',
    description: '',
    imageUrl: ''
  });

  const [userProfile, setUserProfile] = useState({
    name: 'INVESTIDOR OASIS',
    email: 'investidor@oasisrj.com.br',
    bio: 'Colecionador de arte digital e entusiasta do movimento neoconcreto brasileiro.',
    avatarUrl: '',
    avatarScale: 1,
    avatarOffset: 50,
    pin: '0000', 
    walletId: '0x71C...9A23',
  });

  const [userBalance, setUserBalance] = useState(25400.50);
  const [userHoldings, setUserHoldings] = useState<UserHolding[]>([]);

  useEffect(() => {
    fetchAssets();
    
    const savedProfile = localStorage.getItem('aurea_profile');
    if (savedProfile) {
        try {
          const parsed = JSON.parse(savedProfile);
          setUserProfile(prev => ({ 
            ...prev, 
            ...parsed,
            avatarScale: parsed.avatarScale ?? 1,
            avatarOffset: parsed.avatarOffset ?? 50
          }));
        } catch (e) {
          console.error("Erro ao carregar perfil", e);
        }
    }
  }, []);

  // Sincroniza holdings com a lista de ativos inicial apenas uma vez para não apagar compras feitas na sessão
  const holdingsInitialized = useRef(false);
  useEffect(() => {
    if (assets.length > 0 && !holdingsInitialized.current) {
        const autoSyncedHoldings = assets.map(asset => ({
            assetId: asset.id,
            fractionsOwned: 100,
            averagePrice: (asset.fractionPrice || 0) * 0.9
        }));
        setUserHoldings(autoSyncedHoldings);
        holdingsInitialized.current = true;
    }
  }, [assets]);

  const handleLogin = (pin: string) => {
      const updatedProfile = { ...userProfile, pin: pin };
      setUserProfile(updatedProfile);
      localStorage.setItem('aurea_profile', JSON.stringify(updatedProfile));
      
      localStorage.setItem('oasis_session', 'true');
      setIsAuthenticated(true);
      showNotification('Bem-vindo ao Oasis');
  };

  const handleLogout = () => {
      localStorage.removeItem('oasis_session');
      setIsAuthenticated(false);
      setIsSecurityUnlocked(false); 
      setIsAdminAuthenticated(false);
      setCurrentView('HOME');
      setPinValue('');
  };

  const fetchAssets = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('assets')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      if (data && data.length > 0) {
        const formattedAssets: ArtAsset[] = data.map((item: any) => ({
          id: item.id,
          title: item.title,
          artist: item.artist,
          year: item.year,
          totalValue: Number(item.total_value || 0),
          fractionPrice: Number(item.fraction_price || 0),
          totalFractions: Number(item.total_fractions || 1),
          availableFractions: Number(item.available_fractions || 0),
          imageUrl: item.image_url,
          gallery: item.gallery || [],
          insuranceStatus: item.insurance_status as InsuranceStatus,
          insuranceCompany: item.insurance_company,
          policyNumber: item.policy_number,
          insuranceExpiry: item.insurance_expiry,
          technicalReportUrl: item.technical_report_url,
          description: item.description,
          isCatalogOnly: item.is_catalog_only
        }));
        setAssets(formattedAssets);
      } else {
        setAssets(MOCK_ASSETS);
      }
    } catch (err: any) {
      console.warn("Backend indisponível. Carregando modo de demonstração local.");
      setAssets(MOCK_ASSETS);
      if (err.message === 'Failed to fetch' || err.name === 'TypeError') {
        setTimeout(() => showNotification("Modo de Demonstração Ativado"), 1000);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handlePurchase = () => {
    if (!purchaseAsset) return;
    
    const quantity = purchaseAsset.quantity || 1;
    const totalCost = (purchaseAsset.fractionPrice || 0) * quantity;

    if (userBalance < totalCost) {
        showNotification("Saldo insuficiente para esta transação.");
        return;
    }

    setIsLoading(true);
    
    setTimeout(() => {
        setUserBalance(prev => prev - totalCost);
        
        setUserHoldings(prev => {
            const existingIdx = prev.findIndex(h => h.assetId === purchaseAsset.id);
            if (existingIdx >= 0) {
                const updated = [...prev];
                updated[existingIdx] = {
                    ...updated[existingIdx],
                    fractionsOwned: updated[existingIdx].fractionsOwned + quantity
                };
                return updated;
            }
            return [...prev, { assetId: purchaseAsset.id, fractionsOwned: quantity, averagePrice: purchaseAsset.fractionPrice || 0 }];
        });

        setIsLoading(false);
        const purchasedTitle = purchaseAsset.title;
        setPurchaseAsset(null);
        showNotification(`${quantity} fração(ões) de "${purchasedTitle}" adquirida(s) com sucesso!`);
        
        // Redireciona automaticamente para o Portfolio (WALLET) exigindo PIN se necessário
        requestPIN(() => setCurrentView('WALLET'));
    }, 1500);
  };

  // Security Helper
  const requestPIN = (action: () => void) => {
    if (isSecurityUnlocked) {
      action();
    } else {
      setPendingAction(() => action);
      setPinValue('');
      setPinError(false);
    }
  };

  // Finance Handlers
  const handleDeposit = () => {
    const amount = parseFloat(transactionAmount);
    if (isNaN(amount) || amount <= 0) {
      showNotification("Insira um valor válido.");
      return;
    }
    setIsLoading(true);
    setTimeout(() => {
      setUserBalance(prev => prev + amount);
      setIsLoading(false);
      setIsDepositModalOpen(false);
      setTransactionAmount('');
      showNotification(`Depósito de R$ ${amount.toLocaleString('pt-BR')} realizado.`);
    }, 1000);
  };

  const handleWithdraw = () => {
    const amount = parseFloat(transactionAmount);
    if (isNaN(amount) || amount <= 0) {
      showNotification("Insira um valor válido.");
      return;
    }
    if (amount > userBalance) {
      showNotification("Saldo insuficiente para o saque.");
      return;
    }
    setIsLoading(true);
    setTimeout(() => {
      setUserBalance(prev => prev - amount);
      setIsLoading(false);
      setIsWithdrawModalOpen(false);
      setTransactionAmount('');
      showNotification(`Saque de R$ ${amount.toLocaleString('pt-BR')} realizado.`);
    }, 1000);
  };

  const handleAdminEdit = (asset?: ArtAsset) => {
    if (asset) {
      setEditorData({ ...asset, gallery: [...(asset.gallery || [])] });
    } else {
      setEditorData({
        id: crypto.randomUUID(),
        title: '',
        artist: '',
        year: new Date().getFullYear().toString(),
        totalValue: 0,
        fractionPrice: 0,
        totalFractions: 10000,
        availableFractions: 10000,
        imageUrl: '',
        gallery: [],
        insuranceStatus: InsuranceStatus.SECURED,
        insuranceCompany: 'Oasis Safe',
        policyNumber: '',
        insuranceExpiry: new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().split('T')[0],
        technicalReportUrl: '',
        description: '',
        isCatalogOnly: false
      });
    }
    
    if (isAdminAuthenticated) {
        setCurrentView('ADMIN');
    } else {
        setCurrentView('ADMIN_LOGIN');
    }
  };

  const handleAdminSave = async () => {
    if (!editorData.title || !editorData.artist || !editorData.policyNumber) {
      showNotification('Título, Artista e Código da Apólice são obrigatórios');
      return;
    }

    setIsLoading(true);

    const payload = {
      id: editorData.id,
      title: editorData.title,
      artist: editorData.artist,
      year: editorData.year,
      total_value: editorData.totalValue || 0,
      fraction_price: editorData.fractionPrice || 0,
      total_fractions: editorData.totalFractions || 10000,
      available_fractions: editorData.availableFractions || 10000,
      image_url: editorData.imageUrl,
      gallery: editorData.gallery || [],
      insurance_status: editorData.insuranceStatus || InsuranceStatus.SECURED,
      insurance_company: editorData.insuranceCompany || '',
      policy_number: editorData.policy_number || '',
      insurance_expiry: editorData.insurance_expiry || '',
      technical_report_url: editorData.technical_report_url || '',
      description: editorData.description || '',
      is_catalog_only: editorData.isCatalogOnly || false
    };

    try {
      const { error } = await supabase.from('assets').upsert(payload);
      
      if (error) throw error;

      const newAsset = { ...editorData } as ArtAsset;
      setAssets(prev => {
        const existing = prev.findIndex(a => a.id === newAsset.id);
        if (existing >= 0) {
          const updated = [...prev];
          updated[existing] = newAsset;
          return updated;
        }
        return [...prev, newAsset];
      });

      showNotification('Ativo salvo com sucesso!');
    } catch (err: any) {
      console.error("Erro ao salvar:", err);
      showNotification('Erro de conexão com o banco');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAdminDelete = async (id: string) => {
    if (!id) return;
    if (!window.confirm('Tem certeza que deseja excluir este ativo permanentemente do banco de dados e do portfólio?')) return;
    
    setIsLoading(true);
    try {
      const { error } = await supabase.from('assets').delete().eq('id', id);
      
      if (error) throw error;

      setAssets(prev => prev.filter(a => a.id !== id));
      
      if (selectedAsset?.id === id) setSelectedAsset(null);
      setEditorData({});
      
      showNotification('Ativo removido permanentemente.');
      setCurrentView('HOME'); 
    } catch (err) {
      console.error("Erro ao excluir ativo:", err);
      setAssets(prev => prev.filter(a => a.id !== id));
      if (selectedAsset?.id === id) setSelectedAsset(null);
      setEditorData({});
      showNotification('Removido do cache local.');
      setCurrentView('HOME');
    } finally {
      setIsLoading(false);
    }
  };

  const showNotification = (msg: string) => {
    setToastMessage(msg);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 3000);
  };

  const navigateToAsset = (asset: ArtAsset) => {
    setSelectedAsset(asset);
    setCurrentView('ASSET_DETAIL');
  };

  const openCustodyGallery = (asset: ArtAsset) => {
    setSelectedAsset(asset);
    setCurrentView('CUSTODY_GALLERY');
    setGallerySimulations({});
    window.scrollTo(0, 0);
  };

  const handleAssetUnlock = (asset: ArtAsset) => {
    if (isSecurityUnlocked) {
      openCustodyGallery(asset);
      return;
    }
    setLockingAsset(asset);
    setPinValue('');
    setPinError(false);
  };

  const handlePinAction = () => {
    if (pinValue.length !== 4) return;
    if (pinValue === userProfile.pin) {
      setIsSecurityUnlocked(true); 
      if (lockingAsset) {
        openCustodyGallery(lockingAsset);
        setLockingAsset(null);
      }
      if (pendingAction) {
        pendingAction();
        setPendingAction(null);
      }
      setPinValue('');
    } else {
      setPinError(true);
      setTimeout(() => {
        setPinValue('');
        setPinError(false);
      }, 1000);
    }
  };

  const handleProfileSave = (e: React.FormEvent) => {
    e.preventDefault();

    if (!userProfile.name.trim() || userProfile.name === 'INVESTIDOR OASIS') {
      showNotification('O preenchimento do Nome Completo é obrigatório');
      return;
    }

    const emailPrefix = userProfile.email.split('@')[0];
    if (!emailPrefix || userProfile.email === 'investidor@oasisrj.com.br' || userProfile.email === '@oasisrj.com.br') {
      showNotification('O preenchimento do E-mail Corporativo é obrigatório');
      return;
    }

    if (!userProfile.avatarUrl) {
      showNotification('É obrigatório adicionar uma foto de perfil');
      return;
    }

    if (userProfile.pin.length !== 4) {
      showNotification('O PIN deve conter 4 dígitos numéricos');
      return;
    }

    localStorage.setItem('aurea_profile', JSON.stringify(userProfile));
    showNotification('Cadastro atualizado com sucesso!');
    setCurrentView('HOME');
  };

  const handleAvatarFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        showNotification("Foto muito grande (máximo 5MB)");
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        setUserProfile({ ...userProfile, avatarUrl: reader.result as string });
        showNotification("Foto carregada com sucesso");
      };
      reader.readAsDataURL(file);
    }
  };

  const checkAdminCredentials = () => {
    if (adminPwdInput === '5023') {
      setIsAdminAuthenticated(true);
      setAdminLoginError(false);
      setCurrentView('ADMIN');
    } else {
      setAdminLoginError(true);
      setAdminPwdInput('');
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>, type: 'MAIN' | 'GALLERY' | 'TOKENIZE') => {
    const files = Array.from(e.target.files || []) as File[];
    if (files.length === 0) return;

    setIsUploading(true);

    try {
      const processFile = (file: File) => {
        return new Promise<string>((resolve, reject) => {
          if (file.size > 10 * 1024 * 1024) { 
            reject(new Error("Arquivo muito grande"));
            return;
          }
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => reject(new Error("Erro na leitura do arquivo"));
          reader.readAsDataURL(file);
        });
      };

      if (type === 'MAIN') {
        const base64 = await processFile(files[0]);
        setEditorData(prev => ({ ...prev, imageUrl: base64 }));
        showNotification("Capa atualizada");
      } else if (type === 'TOKENIZE') {
        const base64 = await processFile(files[0]);
        setTokenizeData(prev => ({ ...prev, imageUrl: base64 }));
        showNotification("Imagem adicionada");
      } else {
        const newItems: GalleryItem[] = [];
        for (const file of files) {
          const base64 = await processFile(file);
          const title = prompt(`Título para "${file.name}":`, file.name.split('.')[0]) || 'Sem Título';
          
          const defaultTotalValue = editorData.totalValue || 0;
          const defaultFractionPrice = editorData.fractionPrice || 0;

          newItems.push({
            id: crypto.randomUUID(),
            imageUrl: base64,
            title: title,
            year: editorData.year || new Date().getFullYear().toString(),
            totalValue: defaultTotalValue,
            fractionPrice: defaultFractionPrice
          });
        }
        
        setEditorData(prev => ({
          ...prev,
          gallery: [...(prev.gallery || []), ...newItems]
        }));
        showNotification(`${newItems.length} imagem(ns) adicionada(s) à galeria`);
      }
    } catch (err: any) {
      alert(err.message || "Erro ao processar upload");
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  };

  const handleTokenizeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!tokenizeData.title || !tokenizeData.artist || !tokenizeData.imageUrl) {
        showNotification('Título, Artista e Imagem são obrigatórios para avaliação.');
        return;
    }

    setIsLoading(true);
    // Simulating background evaluation request
    setTimeout(() => {
        setIsLoading(false);
        showNotification('Solicitação enviada! Nossa curadoria avaliará seu ativo em até 48h.');
        setCurrentView('HOME');
        setTokenizeData({ title: '', artist: '', year: '', estimatedValue: '', description: '', imageUrl: '' });
    }, 2000);
  };

  const totalPortfolioValue = useMemo(() => {
    return userHoldings.reduce((acc, holding) => {
      // Tenta encontrar o preço nos ativos principais
      const mainAsset = assets.find(a => a.id === holding.assetId);
      if (mainAsset) {
        return acc + (holding.fractionsOwned * (mainAsset.fractionPrice || 0));
      }
      
      // Se não for ativo principal, busca nas galerias (itens de custódia)
      for (const a of assets) {
        const galleryItem = a.gallery?.find(g => g.id === holding.assetId);
        if (galleryItem) {
          const itemTotalValue = galleryItem.totalValue !== undefined ? galleryItem.totalValue : a.totalValue;
          const calculatedPrice = (itemTotalValue || 0) * 0.1; // Lógica da galeria
          return acc + (holding.fractionsOwned * calculatedPrice);
        }
      }
      
      return acc;
    }, 0);
  }, [userHoldings, assets]);

  // --- Render Functions ---

  const renderHome = () => {
    const portfolioArtists = Array.from(new Set(userHoldings.map(h => {
        const asset = assets.find(a => a.id === h.assetId);
        if (asset) return asset.artist;
        
        // Se for item de galeria, busca o artista do pai
        for (const a of assets) {
          if (a.gallery?.some(g => g.id === h.assetId)) return a.artist;
        }
        return null;
    }).filter(Boolean))) as string[];

    const totalEquity = userBalance + totalPortfolioValue;

    const displayName = (() => {
        const parts = userProfile.name.trim().split(/\s+/);
        if (parts.length <= 1) return userProfile.name;
        return `${parts[0]} ${parts[parts.length - 1]}`;
    })();

    return (
    <div className="pt-24 p-4 pb-32 space-y-2 animate-in fade-in duration-500">
      
      {/* Bloco de Elevação Interna: Header + Card Resumo + Acervo Title + Galeria + Artistas em Destaque */}
      <div className="-mt-24 space-y-2 relative z-30">
        <header className="flex justify-between items-start relative z-30 mb-2">
          <div>
            <h1 className="text-5xl font-black bg-gradient-to-r from-amber-200 to-amber-500 bg-clip-text text-transparent uppercase tracking-tighter leading-none mb-1">OASIS</h1>
            <p className="text-slate-400 text-sm font-bold tracking-[0.2em] uppercase pl-1">Fundo de Arte</p>
            <button onClick={() => requestPIN(() => setCurrentView('TOKENIZE'))} className="mt-3 h-7 px-4 bg-amber-500 text-slate-950 rounded-full text-[8px] font-black uppercase tracking-[0.15em] shadow-lg shadow-amber-500/20 active:scale-90 transition-all border border-amber-400/40 flex items-center gap-1.5">
              <i className="fa-solid fa-plus text-[9px]"></i> Tokenizar
            </button>
          </div>
          
          <div className="flex flex-col items-center gap-2">
            <div 
              onClick={() => setCurrentView('PROFILE')} 
              className="h-20 w-20 bg-slate-800 rounded-full flex items-center justify-center border-[2px] border-yellow-400 shadow-xl transition-all overflow-hidden relative cursor-pointer active:scale-95 group"
            >
              {userProfile.avatarUrl ? (
                <img 
                  src={userProfile.avatarUrl} 
                  className="w-full h-full object-cover origin-center" 
                  style={{ 
                    transform: `scale(${userProfile.avatarScale})`,
                    objectPosition: `center ${userProfile.avatarOffset}%`
                  }}
                  alt="Profile" 
                />
              ) : (
                <i className="fa-solid fa-user text-3xl text-yellow-400"></i>
              )}
            </div>
            <span className="text-yellow-400 text-[10px] font-black uppercase tracking-widest leading-none text-center max-w-[80px]">
               {displayName}
            </span>
          </div>
        </header>

        {/* Card Resumo Patrimonial - Altura h-[120px] */}
        <section className="bg-[#1e293b] rounded-[2rem] p-4 py-3 border border-slate-700/50 shadow-2xl relative overflow-hidden z-20 h-[120px] flex flex-col justify-center">
          <div className="absolute -right-6 -top-6 text-slate-700/20 transform rotate-12 pointer-events-none">
              <i className="fa-solid fa-plane text-[100px]"></i>
          </div>

          <div className="relative z-10">
            <p className="text-slate-400 text-[9px] font-black uppercase tracking-[0.2em] mb-0.5 opacity-80 leading-none">Resumo Patrimonial</p>
            <div className="flex items-center gap-2 mb-2">
               <div className="flex items-baseline text-white">
                  <span className="text-base font-bold text-slate-500 mr-1.5">R$</span>
                  <span className={`text-2xl font-black tracking-tighter transition-all duration-700 ${isSecurityUnlocked ? '' : 'filter blur-[4px] select-none opacity-80'}`}>
                      {(totalEquity || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
               </div>
               <span className="bg-[#10b981]/20 text-[#34d399] text-[9px] font-black px-1.5 py-0.5 rounded-full">+2.4%</span>
            </div>

            <div className="flex gap-2">
              <button 
                onClick={() => requestPIN(() => { setTransactionAmount(''); setIsDepositModalOpen(true); })}
                className="flex-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black py-2.5 rounded-xl text-[9px] uppercase tracking-[0.12em] shadow-lg shadow-amber-500/20 transition-all active:scale-[0.98]"
              >
                 Depositar
              </button>
              <button 
                onClick={() => requestPIN(() => { setTransactionAmount(''); setIsWithdrawModalOpen(true); })}
                className="flex-1 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black py-2.5 rounded-xl text-[9px] uppercase tracking-[0.12em] shadow-lg shadow-emerald-500/20 transition-all active:scale-98"
              >
                 Sacar
              </button>
            </div>
          </div>
        </section>

        {/* Seção ACERVO / ON LINE - Padding top removido para respeitar space-y-2 do pai */}
        <div className="flex items-center justify-between px-1">
          <h3 className="text-xl font-black text-white uppercase tracking-widest leading-none">ACERVO</h3>
          <a href="https://fundodearte.com/artistas-acervo" target="_blank" rel="noopener noreferrer" className="bg-amber-500 hover:bg-amber-400 text-slate-950 px-5 py-2 rounded-full flex items-center gap-2 shadow-lg shadow-amber-500/20 transition-all active:scale-95">
            <i className="fa-solid fa-globe text-xs"></i> 
            <span className="text-[9px] font-black uppercase tracking-widest">ONLINE</span>
          </a>
        </div>

        {/* GALERIA DE ARQUIVOS - Movido para dentro do bloco elevado com space-y-2 */}
        <div className="relative w-full bg-slate-900 rounded-[2rem] overflow-hidden shadow-2xl border border-slate-800 z-10 h-[120px]">
          <div className="absolute inset-0">
            <img src="https://images.unsplash.com/photo-1468581264429-2548ef9eb732?q=80&w=2070&auto=format&fit=crop" className="w-full h-full object-cover" alt="Coast" />
            <div className="absolute inset-0 bg-slate-950/80"></div>
          </div>
          
          <div className="relative p-4 h-full flex flex-col justify-center">
            <div className="flex items-center gap-3">
                <div className="h-10 w-10 bg-amber-500 rounded-xl flex items-center justify-center shadow-lg shrink-0">
                    <i className="fa-solid fa-building-columns text-slate-950 text-xl"></i>
                </div>
                <div>
                    <h4 className="text-white font-black uppercase text-lg leading-none tracking-tight">GALERIA DE ARQUIVOS</h4>
                    <p className="text-amber-500 text-[8px] font-black uppercase tracking-widest mt-0.5">FUNDODEARTE.COM/ARTISTAS-ACERVO</p>
                </div>
            </div>
            
            <p className="text-slate-300 text-[10px] font-medium leading-tight opacity-90 mt-2 line-clamp-1">
                Acesso exclusivo à curadoria de ativos históricos sob gestão do Fundo de Arte.
            </p>
          </div>
        </div>

        {/* ARTISTAS EM DESTAQUE - Movido para dentro do bloco elevado para ter space-y-1 */}
        <div className="space-y-1">
           <p className="text-emerald-500 text-[14px] font-black uppercase tracking-[0.2em] pl-1">Artistas em Destaque</p>
           <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide snap-x">
              {Array.from(new Set(assets.map(a => a.artist))).map((artist, idx) => {
                 const asset = assets.find(a => a.artist === artist);
                 if (!asset) return null;
                 return (
                    <div key={idx} onClick={() => navigateToAsset(asset)} className="min-w-[120px] h-[160px] bg-slate-900 rounded-[1.5rem] border border-slate-800 overflow-hidden relative group shadow-lg shrink-0 snap-start cursor-pointer active:scale-95 transition-transform">
                       <img src={asset.imageUrl} className="absolute inset-0 w-full h-full object-cover opacity-60 group-hover:scale-110 transition-transform duration-700" alt={artist} />
                       <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/20 to-transparent"></div>
                       <div className="absolute bottom-0 left-0 right-0 p-3.5 flex flex-col items-start justify-end h-full">
                          <div className="h-0.5 w-4 bg-amber-500 mb-2"></div>
                          <p className="text-slate-300 text-[7px] font-bold uppercase tracking-widest mb-0.5">ARTISTA</p>
                          <p className="text-white text-[10px] font-black uppercase leading-tight tracking-wider">{artist}</p>
                       </div>
                    </div>
                 );
              })}
           </div>
        </div>
      </div>

      <section className="space-y-4">
        <div className="space-y-1 pt-0">
          <div className="flex items-center gap-2.5 px-1 mb-0.5">
            <div className="h-[1px] flex-1 bg-slate-800/40"></div>
            <span className="text-emerald-500 text-[14px] font-black uppercase tracking-widest opacity-80">Ativos Sob Custódia</span>
            <div className="h-[1px] flex-1 bg-slate-800/40"></div>
          </div>
          <div className="space-y-3">
              {portfolioArtists.map((artistName) => {
                  const userAsset = assets.find(a => a.artist === artistName);
                  if (!userAsset) {
                    // Tenta achar um proxy pelo artista
                    const proxyAsset = assets.find(a => a.artist === artistName);
                    if (!proxyAsset) return null;
                    return (
                      <div key={artistName} onClick={() => handleAssetUnlock(proxyAsset)} className="bg-slate-900/60 border border-slate-800/80 rounded-[1.5rem] p-3.5 flex items-center gap-3 cursor-pointer hover:border-amber-500/40 transition-all active:scale-[0.98] shadow-lg relative overflow-hidden group">
                        <div className="absolute top-2 right-2 h-7 w-7 bg-slate-950/80 backdrop-blur-md rounded-full flex items-center justify-center border border-slate-800 text-amber-500 shadow-sm z-20 transition-all group-hover:bg-amber-500 group-hover:text-slate-950">
                          <i className="fa-solid fa-lock text-[10px]"></i>
                        </div>
                        <div className="h-16 w-16 rounded-xl overflow-hidden shrink-0 border border-slate-700/30 shadow-md relative">
                          <img src={proxyAsset.imageUrl} className="w-full h-full object-cover" alt="" />
                        </div>
                        <div className="flex-1 min-w-0 z-10">
                          <p className="text-amber-500 text-[9px] font-black uppercase tracking-wider mb-0.5">{artistName}</p>
                          <h4 className="text-white font-black text-xs truncate uppercase tracking-tight mb-2">Galeria Privada</h4>
                          <InsuranceBadge status={proxyAsset.insuranceStatus} />
                        </div>
                      </div>
                    );
                  }

                  return (
                  <div key={artistName} onClick={() => handleAssetUnlock(userAsset)} className="bg-slate-900/60 border border-slate-800/80 rounded-[1.5rem] p-3.5 flex items-center gap-3 cursor-pointer hover:border-amber-500/40 transition-all active:scale-[0.98] shadow-lg relative overflow-hidden group">
                      <div className="absolute top-2 right-2 h-7 w-7 bg-slate-950/80 backdrop-blur-md rounded-full flex items-center justify-center border border-slate-800 text-amber-500 shadow-sm z-20 transition-all group-hover:bg-amber-500 group-hover:text-slate-950">
                          <i className="fa-solid fa-lock text-[10px]"></i>
                      </div>
                      <div className="h-16 w-16 rounded-xl overflow-hidden shrink-0 border border-slate-700/30 shadow-md relative">
                          <div className="absolute inset-0 bg-slate-950/20 backdrop-blur-[0px] z-10"></div>
                          <img src={userAsset.imageUrl} className="w-full h-full object-cover" alt="" />
                      </div>
                      <div className="flex-1 min-w-0 z-10">
                          <p className="text-amber-500 text-[9px] font-black uppercase tracking-wider mb-0.5">{userAsset.artist}</p>
                          <h4 className="text-white font-black text-xs truncate uppercase tracking-tight mb-2">Galeria Privada</h4>
                          
                          <div className="flex items-center gap-2">
                             <InsuranceBadge status={userAsset.insuranceStatus} />
                             <span className="text-slate-400 text-[9px] font-bold">|</span>
                             <div className="flex items-baseline gap-0.5">
                                <span className="text-[8px] text-amber-500 font-bold">R$</span>
                                <span className={`text-white text-[10px] font-black transition-all duration-500 ${isSecurityUnlocked ? '' : 'filter blur-[1.5px] select-none opacity-90'}`}>
                                    {(userAsset.fractionPrice || 0).toLocaleString('pt-BR')}
                                </span>
                             </div>
                          </div>
                      </div>
                      <div className="mr-2 opacity-50">
                         <i className="fa-solid fa-chevron-right text-slate-500 text-xs"></i>
                      </div>
                  </div>
                  );
              })}
          </div>
        </div>
      </section>

      {/* Lock Screen Modal */}
      {(lockingAsset || pendingAction) && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 animate-in fade-in duration-300">
           <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-xl" onClick={() => { setLockingAsset(null); setPendingAction(null); }}></div>
           <div className="bg-slate-900 border border-slate-800 p-8 rounded-[2.5rem] w-full max-w-[320px] relative z-10 shadow-2xl text-center space-y-6">
              <div className="h-16 w-16 bg-amber-500/10 rounded-full flex items-center justify-center mx-auto border border-amber-500/20 text-amber-500">
                 <i className="fa-solid fa-key text-2xl"></i>
              </div>
              
              <div className="space-y-1">
                <h4 className="text-white font-black text-lg uppercase tracking-tight">Área Restrita</h4>
                <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest">Insira o PIN definido no login</p>
              </div>

              <div className="flex justify-center gap-3 relative overflow-hidden h-14">
                {[0, 1, 2, 3].map((idx) => (
                    <div key={idx} className={`h-12 w-12 rounded-2xl border-2 flex items-center justify-center transition-all ${pinValue.length > idx ? 'border-amber-500 bg-amber-500/5 shadow-[0_0_10px_rgba(245,158,11,0.3)]' : 'border-slate-800 bg-slate-950'}`}>
                        {pinValue.length > idx && <div className="h-2.5 w-2.5 bg-amber-500 rounded-full animate-in zoom-in duration-200"></div>}
                    </div>
                ))}
                
                <input 
                  type="tel" 
                  maxLength={4} 
                  autoFocus
                  className="absolute inset-0 opacity-0 cursor-pointer z-10 w-full h-full text-center"
                  style={{ fontSize: '16px' }}
                  value={pinValue}
                  onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, '').slice(0, 4);
                      setPinValue(val);
                      setPinError(false);
                      
                      if (val.length === 4) {
                          if (val === userProfile.pin) {
                               setIsSecurityUnlocked(true); 
                               if (lockingAsset) {
                                  openCustodyGallery(lockingAsset);
                                  setLockingAsset(null);
                                }
                                if (pendingAction) {
                                  pendingAction();
                                  setPendingAction(null);
                                }
                                setPinValue('');
                          } else {
                              setPinError(true);
                              setTimeout(() => {
                                setPinValue('');
                              }, 800);
                          }
                      }
                  }}
                />
              </div>

              {pinError && <p className="text-red-500 text-[10px] font-black uppercase tracking-widest animate-pulse">PIN Incorreto</p>}

              <div className="space-y-3">
                <button 
                  onClick={handlePinAction}
                  className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-black py-4 rounded-2xl text-[11px] uppercase tracking-[0.3em] active:scale-95 transition-all shadow-lg"
                >
                  Desbloquear
                </button>
                
                <button 
                  onClick={() => { 
                    setLockingAsset(null);
                    setPendingAction(null);
                    setCurrentView('PROFILE'); 
                    setTimeout(() => {
                      const el = document.getElementById('pin-field');
                      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      el?.focus();
                    }, 300);
                  }}
                  className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black py-4 rounded-2xl text-[11px] uppercase tracking-[0.3em] active:scale-95 transition-all shadow-xl shadow-emerald-500/20 border border-emerald-400/40"
                >
                  Defina seu PIN
                </button>
              </div>

              <div onClick={() => { setLockingAsset(null); setPendingAction(null); }} className="text-slate-400 hover:text-white text-[9px] font-black uppercase tracking-widest pt-2 transition-colors cursor-pointer">
                Cancelar
              </div>
           </div>
        </div>
      )}
    </div>
  );
  };

  const renderPortfolio = () => {
    return (
      <div className="p-5 pb-32 animate-in fade-in duration-500">
        <header className="mb-8">
          <h2 className="text-4xl font-black text-white uppercase tracking-tighter mb-1">Portfolio</h2>
          <p className="text-emerald-500 text-[10px] font-black uppercase tracking-[0.3em]">Seus Ativos Adquiridos</p>
        </header>

        {userHoldings.length === 0 ? (
          <div className="py-24 text-center space-y-4">
             <div className="h-20 w-20 bg-slate-900 border border-slate-800 rounded-full flex items-center justify-center mx-auto text-slate-700 mb-4 opacity-50">
                <i className="fa-solid fa-folder-open text-3xl"></i>
             </div>
             <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest">Nenhum ativo em carteira</p>
             <button onClick={() => setCurrentView('MARKETPLACE')} className="text-amber-500 text-[9px] font-black uppercase underline tracking-widest underline-offset-4">Explorar Oportunidades</button>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="bg-gradient-to-br from-[#111827] to-[#070b14] border border-emerald-500/30 p-7 rounded-[2.5rem] shadow-2xl relative overflow-hidden">
               <div className="absolute -right-8 -bottom-8 text-emerald-500/5 rotate-12 pointer-events-none">
                  <i className="fa-solid fa-wallet text-[120px]"></i>
               </div>
               <p className="text-slate-500 text-[9px] font-black uppercase tracking-[0.2em] mb-1">Valor Investido</p>
               <div className="flex items-baseline gap-2">
                  <span className="text-slate-600 font-bold text-lg">R$</span>
                  <span className="text-4xl font-black text-white tracking-tighter">{(totalPortfolioValue || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
               </div>
               <div className="mt-4 flex items-center gap-2">
                  <span className="text-[9px] font-black uppercase tracking-widest text-emerald-400 bg-emerald-400/10 px-2.5 py-1 rounded-full">{userHoldings.length} Ativos</span>
                  <span className="text-[9px] font-black uppercase tracking-widest text-slate-500 bg-slate-800/40 px-2.5 py-1 rounded-full">Total Liquidez</span>
               </div>
            </div>

            <div className="space-y-4">
               {userHoldings.map((holding) => {
                  const asset = assets.find(a => a.id === holding.assetId);
                  let displayAsset = asset;
                  if (!displayAsset) {
                    for (const a of assets) {
                      const item = a.gallery?.find(g => g.id === holding.assetId);
                      if (item) {
                        displayAsset = { ...a, ...item, id: item.id } as ArtAsset;
                        break;
                      }
                    }
                  }

                  if (!displayAsset) return null;

                  const currentVal = (displayAsset.fractionPrice || 0) * holding.fractionsOwned;

                  return (
                    <div key={holding.assetId} className="bg-slate-900/60 border border-slate-800/80 rounded-[2.5rem] p-4 flex gap-4 items-center shadow-xl active:scale-[0.98] transition-all hover:border-emerald-500/20 group">
                       <div className="h-24 w-24 rounded-2xl overflow-hidden shrink-0 border border-slate-700/30 relative">
                          <img src={displayAsset.imageUrl} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" alt="" />
                       </div>
                       <div className="flex-1 min-w-0 pr-2">
                          <div className="mb-2">
                             <p className="text-amber-500 text-[8px] font-black uppercase tracking-widest mb-0.5">{displayAsset.artist}</p>
                             <h4 className="text-white font-black text-xs truncate uppercase tracking-tight">{displayAsset.title}</h4>
                          </div>
                          
                          <div className="grid grid-cols-2 gap-y-2 gap-x-3 border-t border-slate-800/50 pt-2">
                             <div>
                                <p className="text-slate-600 text-[7px] font-black uppercase tracking-widest mb-0.5">Frações</p>
                                <p className="text-white font-bold text-[10px]">{holding.fractionsOwned} UN.</p>
                             </div>
                             <div className="text-right">
                                <p className="text-slate-600 text-[7px] font-black uppercase tracking-widest mb-0.5">Preço/Fra</p>
                                <p className="text-emerald-400 font-bold text-[10px]">R$ {(displayAsset.fractionPrice || 0).toLocaleString('pt-BR')}</p>
                             </div>
                             <div className="col-span-2 flex justify-between items-center pt-1 border-t border-slate-800/30">
                                <p className="text-slate-500 text-[7px] font-black uppercase tracking-widest">Total Alocado</p>
                                <p className="text-white font-black text-[12px]">R$ {currentVal.toLocaleString('pt-BR')}</p>
                             </div>
                          </div>
                       </div>
                    </div>
                  );
               })}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderAdminLogin = () => {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 animate-in fade-in duration-500">
        <div className="w-full max-sm space-y-8">
           <div className="text-center space-y-4">
              <div className="h-20 w-20 bg-amber-500/10 rounded-3xl flex items-center justify-center mx-auto border border-amber-500/20 text-amber-500 shadow-2xl">
                 <i className="fa-solid fa-user-shield text-3xl"></i>
              </div>
              <h2 className="text-white font-black text-2xl uppercase tracking-tighter">ACESSO RESTRITO</h2>
              <p className="text-slate-500 text-[10px] font-bold uppercase tracking-[0.3em]">Painel de Controle Institucional</p>
           </div>

           <div className="bg-slate-900 border border-slate-800 p-8 rounded-[2.5rem] shadow-2xl space-y-6">
              <div className="space-y-2">
                 <div className="text-slate-500 text-[10px] font-black uppercase tracking-widest ml-1">Senha Administrativa (PIN de 4 dígitos)</div>
                 <input 
                    type="tel"
                    maxLength={4}
                    autoFocus
                    value={adminPwdInput}
                    onChange={(e) => { setAdminPwdInput(e.target.value.replace(/\D/g, '').slice(0, 4)); setAdminLoginError(false); }}
                    onKeyDown={(e) => e.key === 'Enter' && checkAdminCredentials()}
                    className="w-full bg-slate-950 border border-slate-800 rounded-2xl py-5 px-6 text-white text-center text-3xl font-bold focus:border-amber-500 outline-none transition-all shadow-inner tracking-[0.8em]"
                    placeholder="0000"
                 />
                 {adminLoginError && <p className="text-red-500 text-[10px] font-black uppercase text-center mt-2 animate-pulse">PIN Admin Incorreto</p>}
              </div>

              <button 
                 onClick={checkAdminCredentials}
                 className="w-full bg-amber-500 text-slate-950 font-black py-5 rounded-2xl text-xs uppercase tracking-[0.4em] active:scale-95 transition-all shadow-lg"
              >
                 ENTRAR NO PAINEL
              </button>
              
              <button 
                 onClick={() => setCurrentView('PROFILE')}
                 className="w-full text-slate-500 hover:text-white text-[9px] font-black uppercase tracking-[0.3em] transition-colors"
              >
                 Cancelar
              </button>
           </div>
        </div>
      </div>
    );
  };

  const renderAdminEditor = () => {
    if (!isAdminAuthenticated) return renderAdminLogin();
    const isNew = !assets.find(a => a.id === editorData.id);

    return (
      <div className="min-h-screen bg-[#070b14] animate-in slide-in-from-right duration-500 pb-32 overflow-x-hidden">
        <input 
          type="file" 
          ref={mainImageInputRef} 
          className="hidden" 
          accept="image/*" 
          onChange={(e) => handleFileChange(e, 'MAIN')} 
        />
        <input 
          type="file" 
          ref={galleryImageInputRef} 
          className="hidden" 
          accept="image/*" 
          multiple
          onChange={(e) => handleFileChange(e, 'GALLERY')} 
        />

        <div className="bg-[#0f172a]/95 backdrop-blur-xl border-b border-slate-800 p-4 pt-10 sticky top-0 z-[60] shadow-2xl">
           <div className="flex gap-3 overflow-x-auto pb-4 scrollbar-hide snap-x items-center">
              <button onClick={() => handleAdminEdit()} className={`min-w-[110px] h-14 rounded-2xl border flex items-center justify-center gap-2 transition-all shrink-0 snap-start ${isNew ? 'bg-amber-500/20 border-amber-500 text-amber-500 shadow-[0_0_20px_rgba(245,158,11,0.2)]' : 'bg-slate-900/50 border-slate-800 text-slate-500'}`}>
                 <i className="fa-solid fa-plus text-lg"></i>
                 <span className="text-[11px] font-black uppercase tracking-[0.2em]">NOVO</span>
              </button>
              {assets.map((asset) => (
                 <button key={asset.id} onClick={() => handleAdminEdit(asset)} className={`min-w-[140px] h-14 rounded-2xl border flex items-center gap-3 px-3 transition-all shrink-0 snap-start relative group overflow-hidden ${editorData.id === asset.id ? 'bg-white border-white text-slate-950 shadow-lg' : 'bg-slate-900/50 border-slate-800 text-slate-500'}`}>
                    <div className="h-9 w-9 rounded-xl overflow-hidden border border-slate-700/50 shrink-0">
                       <img src={asset.imageUrl} className="w-full h-full object-cover" alt="" />
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-tighter truncate leading-tight">{asset.title}</span>
                 </button>
              ))}
           </div>
           <div className="w-full h-1.5 bg-slate-900 mt-2 rounded-full overflow-hidden border border-slate-800/50">
              <div className="h-full w-1/4 bg-slate-400 transition-all duration-700 shadow-[0_0_10px_white]"></div>
           </div>
        </div>

        <div className="p-6 pt-10 space-y-10 max-w-md mx-auto">
          <div className="bg-[#111827]/80 border border-slate-800 p-8 rounded-[3.5rem] space-y-10 shadow-[0_40px_100px_rgba(0,0,0,0.6)] relative overflow-hidden backdrop-blur-md">
             <div className="flex items-center justify-between px-2">
                <div className="flex items-center gap-3">
                    <button onClick={() => setCurrentView('HOME')} className="text-amber-500 hover:text-amber-400 transition-colors">
                        <i className="fa-solid fa-arrow-left text-xl"></i>
                    </button>
                    <h2 className="text-white font-black text-2xl uppercase tracking-tighter">EDITAR ATIVO</h2>
                </div>
                <button onClick={() => setCurrentView('HOME')} className="h-10 w-10 bg-slate-900 border border-slate-800 rounded-full flex items-center justify-center text-slate-500 hover:text-white transition-all active:scale-75 shadow-lg">
                   <i className="fa-solid fa-xmark"></i>
                </button>
             </div>

             <div className="space-y-8">
                <div className="grid grid-cols-2 gap-5">
                  <div className="space-y-3">
                    <label className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em] ml-2">TÍTULO</label>
                    <input className="w-full bg-[#030712] border border-slate-800 rounded-[1.5rem] py-5 px-6 text-white text-sm font-bold outline-none focus:border-amber-500/50 transition-all shadow-inner" value={editorData.title || ''} placeholder="Ex: Metaesquema" onChange={e => setEditorData({...editorData, title: e.target.value})} />
                  </div>
                  <div className="space-y-3">
                    <label className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em] ml-2">ARTISTA</label>
                    <input className="w-full bg-[#030712] border border-slate-800 rounded-[1.5rem] py-5 px-6 text-white text-sm font-bold outline-none focus:border-amber-500/50 transition-all shadow-inner" value={editorData.artist || ''} placeholder="Ex: Hélio Oiticica" onChange={e => setEditorData({...editorData, artist: e.target.value})} />
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em] ml-2">DESCRIÇÃO</label>
                  <textarea rows={5} className="w-full bg-[#030712] border border-slate-800 rounded-[1.5rem] py-5 px-6 text-white text-sm font-medium outline-none focus:border-amber-500/50 transition-all resize-none shadow-inner leading-relaxed" placeholder="..." value={editorData.description || ''} onChange={e => setEditorData({...editorData, description: e.target.value})} />
                </div>

                <div className="space-y-3">
                   <label className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em] ml-2">IMAGEM PRINCIPAL (CAPA)</label>
                   <div 
                      onClick={() => mainImageInputRef.current?.click()} 
                      className="relative aspect-video bg-[#030712] border-2 border-dashed border-slate-800 rounded-[2.5rem] overflow-hidden group cursor-pointer hover:border-amber-500/50 transition-all shadow-2xl"
                   >
                      {editorData.imageUrl ? (
                        <img src={editorData.imageUrl} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" alt="Asset Preview" />
                      ) : (
                        <div className="flex flex-col items-center justify-center h-full text-slate-600 gap-3">
                           <i className="fa-solid fa-cloud-arrow-up text-4xl"></i>
                           <span className="text-[11px] font-black uppercase tracking-[0.3em]">UPLOAD COVER</span>
                        </div>
                      )}
                      {isUploading && (
                        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center text-amber-500">
                           <i className="fa-solid fa-circle-notch fa-spin text-3xl mb-2"></i>
                           <span className="text-[10px] font-black uppercase tracking-widest">Processando...</span>
                        </div>
                      )}
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all backdrop-blur-[4px]">
                        <div className="bg-white text-slate-950 px-8 py-4 rounded-full text-[11px] font-black uppercase tracking-[0.4em] shadow-2xl scale-90 group-hover:scale-100 transition-transform">SELECIONAR ARQUIVO</div>
                      </div>
                   </div>
                </div>

                <div className="grid grid-cols-2 gap-5">
                  <div className="space-y-3">
                    <label className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em] ml-2">VALOR TOTAL (R$)</label>
                    <input type="number" className="w-full bg-[#030712] border border-slate-800 rounded-[1.5rem] py-5 px-6 text-white text-sm font-bold outline-none focus:border-amber-500/50 transition-all shadow-inner" value={editorData.totalValue || ''} onChange={e => {
                      const totalVal = Number(e.target.value);
                      const fractCount = editorData.totalFractions || 10000;
                      setEditorData({
                        ...editorData, 
                        totalValue: totalVal,
                        fractionPrice: totalVal / fractCount
                      });
                    }} />
                  </div>
                  <div className="space-y-3">
                    <label className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em] ml-2">PREÇO FRAÇÃO (R$)</label>
                    <input type="number" step="any" className="w-full bg-[#030712] border border-slate-800 rounded-[1.5rem] py-5 px-6 text-white text-sm font-bold outline-none focus:border-amber-500/50 transition-all shadow-inner" value={editorData.fractionPrice || ''} onChange={e => {
                      const fractPrice = Number(e.target.value);
                      const fractCount = editorData.totalFractions || 10000;
                      setEditorData({
                        ...editorData, 
                        fractionPrice: fractPrice,
                        totalValue: fractPrice * fractCount
                      });
                    }} />
                  </div>
                </div>

                <div className="space-y-6 pt-6 border-t border-slate-800/50">
                  <h3 className="text-white text-[11px] font-black uppercase tracking-[0.3em] ml-2 flex items-center gap-2">
                    <i className="fa-solid fa-shield-halved text-amber-500"></i> Garantia & Custódia
                  </h3>
                  
                  <div className="space-y-5">
                    <div className="space-y-3">
                      <label className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em] ml-2">SEGURADORA</label>
                      <input className="w-full bg-[#030712] border border-slate-800 rounded-[1.5rem] py-5 px-6 text-white text-sm font-bold outline-none focus:border-amber-500/50 transition-all shadow-inner" 
                             value={editorData.insuranceCompany || ''} 
                             placeholder="Ex: Allianz Art & Heritage" 
                             onChange={e => setEditorData({...editorData, insuranceCompany: e.target.value})} />
                    </div>
                    
                    <div className="grid grid-cols-2 gap-5">
                      <div className="space-y-3">
                        <label className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em] ml-2">Nº DA APÓLICE</label>
                        <input className="w-full bg-[#030712] border border-slate-800 rounded-2xl py-5 px-6 text-white text-sm font-bold outline-none focus:border-amber-500/50 transition-all shadow-inner" 
                               value={editorData.policyNumber || ''} 
                               placeholder="Ex: ALZ-9921-X" 
                               onChange={e => setEditorData({...editorData, policyNumber: e.target.value})} />
                      </div>
                      <div className="space-y-3">
                        <label className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em] ml-2">VIGÊNCIA (VENCIMENTO)</label>
                        <input type="date" className="w-full bg-[#030712] border border-slate-800 rounded-[1.5rem] py-5 px-6 text-white text-sm font-bold outline-none focus:border-amber-500/50 transition-all shadow-inner" 
                               value={editorData.insuranceExpiry ? editorData.insuranceExpiry.split('T')[0] : ''} 
                               onChange={e => setEditorData({...editorData, insuranceExpiry: e.target.value})} />
                      </div>
                    </div>
                  </div>
                </div>

                <div onClick={() => setEditorData({...editorData, isCatalogOnly: !editorData.isCatalogOnly})} className="bg-[#030712] border border-slate-800 p-8 rounded-[2rem] flex items-center justify-between cursor-pointer active:scale-[0.98] transition-all shadow-lg">
                   <span className="text-white text-[12px] font-black uppercase tracking-[0.3em] opacity-80">ITEM DE CATÁLOGO (SEM VENDA)</span>
                   <div className={`w-16 h-10 rounded-full p-1.5 relative transition-all duration-500 shadow-inner ${editorData.isCatalogOnly ? 'bg-amber-500 shadow-[0_0_20px_rgba(245,158,11,0.3)]' : 'bg-slate-800'}`}>
                      <div className={`h-7 w-7 rounded-full bg-white shadow-xl transform transition-all duration-500 ease-out ${editorData.isCatalogOnly ? 'translate-x-6' : 'translate-x-0'}`}></div>
                   </div>
                </div>

                <div className="space-y-6 pt-8 border-t border-slate-800/50">
                   <div className="flex items-center justify-between px-2">
                      <div className="flex flex-col">
                        <label className="text-[11px] text-slate-500 font-black uppercase tracking-[0.3em]">GALERIA ADICIONAL (CUSTÓDIA)</label>
                        <span className="text-[8px] text-slate-600 uppercase font-bold tracking-widest">Defina título, valor total e preço por obra</span>
                      </div>
                      <button 
                        onClick={() => galleryImageInputRef.current?.click()} 
                        disabled={isUploading}
                        className="h-10 px-6 bg-amber-500/10 border border-amber-500/30 text-amber-500 text-[10px] font-black uppercase tracking-[0.4em] rounded-full flex items-center gap-2 active:scale-90 transition-all shadow-lg disabled:opacity-50"
                      >
                         {isUploading ? <i className="fa-solid fa-circle-notch fa-spin"></i> : <i className="fa-solid fa-plus text-xs"></i>}
                         {isUploading ? 'PROCESSANDO' : 'ADD IMAGEM'}
                      </button>
                   </div>
                   
                   <div className="space-y-12">
                      {(editorData.gallery || []).length === 0 && !isUploading && (
                        <div className="py-10 border-2 border-dashed border-slate-800 rounded-[2rem] flex flex-col items-center justify-center text-slate-700">
                           <i className="fa-solid fa-images text-3xl mb-2 opacity-20"></i>
                           <p className="text-[10px] font-black uppercase tracking-widest opacity-40">Nenhuma obra na galeria</p>
                        </div>
                      )}
                      
                      {(editorData.gallery || []).map((item, index) => (
                         <div key={item.id} className="bg-[#111827]/60 border border-slate-800 rounded-[3rem] p-8 flex flex-col gap-8 items-stretch shadow-2xl relative group">
                            <div className="relative w-full aspect-video bg-slate-900 rounded-[2rem] overflow-hidden border border-slate-800 shadow-xl group/img">
                               <img src={item.imageUrl} className="w-full h-full object-cover transition-transform duration-700 group-hover/img:scale-110" alt="" />
                               <button onClick={(e) => { e.stopPropagation(); setEditorData(prev => ({ ...prev, gallery: (prev.gallery || []).filter(g => g.id !== item.id) })); }} className="absolute top-4 right-4 h-10 w-10 bg-red-500 text-white rounded-2xl flex items-center justify-center text-sm shadow-2xl active:scale-75 transition-all opacity-0 group-hover:opacity-100 backdrop-blur-md">
                                  <i className="fa-solid fa-trash-can"></i>
                               </button>
                            </div>
                            
                            <div className="w-full space-y-6">
                               <div className="space-y-3">
                                  <label className="text-[10px] text-slate-500 font-black uppercase tracking-[0.3em] ml-2">TÍTULO DA OBRA</label>
                                  <input 
                                    className="w-full bg-[#030712] border border-slate-800 rounded-2xl py-4 px-5 text-white text-sm font-bold focus:border-amber-500/50 outline-none transition-all shadow-inner" 
                                    value={item.title} 
                                    onChange={(e) => {
                                      const newGallery = [...(editorData.gallery || [])];
                                      newGallery[index] = { ...item, title: e.target.value };
                                      setEditorData({ ...editorData, gallery: newGallery });
                                    }}
                                  />
                               </div>
                               
                               <div className="grid grid-cols-2 gap-5">
                                  <div className="space-y-3">
                                     <label className="text-[10px] text-slate-500 font-black uppercase tracking-[0.3em] ml-2">VALOR TOTAL (R$)</label>
                                     <input 
                                       type="number"
                                       className="w-full bg-[#030712] border border-slate-800 rounded-2xl py-4 px-5 text-white text-sm font-bold focus:border-amber-500/50 outline-none transition-all shadow-inner" 
                                       value={item.totalValue || 0} 
                                       onChange={(e) => {
                                         const val = Number(e.target.value);
                                         const count = editorData.totalFractions || 10000;
                                         const newGallery = [...(editorData.gallery || [])];
                                         newGallery[index] = { 
                                           ...item, 
                                           totalValue: val,
                                           fractionPrice: val / count 
                                         };
                                         setEditorData({ ...editorData, gallery: newGallery });
                                       }}
                                     />
                                  </div>
                                  <div className="space-y-3">
                                     <label className="text-[10px] text-slate-500 font-black uppercase tracking-[0.3em] ml-2">PREÇO / FRAÇÃO (R$)</label>
                                     <input 
                                       type="number"
                                       step="any"
                                       className="w-full bg-[#030712] border border-slate-800 rounded-2xl py-4 px-5 text-amber-500 text-sm font-black focus:border-amber-500 outline-none transition-all shadow-inner" 
                                       value={item.fractionPrice || 0} 
                                       onChange={(e) => {
                                         const p = Number(e.target.value);
                                         const count = editorData.totalFractions || 10000;
                                         const newGallery = [...(editorData.gallery || [])];
                                         newGallery[index] = { 
                                           ...item, 
                                           fractionPrice: p,
                                           totalValue: p * count
                                         };
                                         setEditorData({ ...editorData, gallery: newGallery });
                                       }}
                                     />
                                  </div>
                               </div>
                            </div>
                         </div>
                      ))}
                   </div>
                </div>

                <div className="pt-12 flex flex-col gap-5">
                   <button onClick={handleAdminSave} disabled={isLoading || isUploading} className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-black py-7 rounded-[3rem] text-[13px] uppercase tracking-[0.6em] shadow-[0_20px_50px_rgba(245,158,11,0.3)] active:scale-95 transition-all flex items-center justify-center gap-4 disabled:bg-slate-800 disabled:text-slate-600 disabled:shadow-none">
                     {isLoading ? <><i className="fa-solid fa-circle-notch fa-spin"></i> SALVANDO...</> : <><i className="fa-solid fa-check-double"></i> SALVAR ALTERAÇÕES</>}
                   </button>
                   {!isNew && (
                    <button onClick={() => handleAdminDelete(editorData.id!)} className="w-full bg-transparent border border-red-500/20 text-red-500/40 py-5 text-[11px] font-black uppercase tracking-[0.4em] rounded-full hover:bg-red-500/10 hover:text-red-500 transition-all mt-6 shadow-inner cursor-pointer">
                        <i className="fa-solid fa-trash-can mr-2"></i> EXCLUIR ATIVO PERMANENTEMENTE
                    </button>
                   )}
                </div>

                <div className="pt-10 flex flex-col items-center gap-4">
                    <button onClick={() => { setIsAdminAuthenticated(false); setCurrentView('HOME'); }} className="text-slate-500 hover:text-white text-[11px] font-black uppercase tracking-[0.4em] transition-all flex items-center gap-3">
                        <i className="fa-solid fa-house text-sm"></i> VOLTAR PARA PÁGINA INICIAL
                    </button>
                </div>
             </div>
          </div>
        </div>
      </div>
    );
  };

  const renderTokenize = () => {
    return (
      <div className="min-h-screen bg-[#070b14] animate-in slide-in-from-right duration-500 pb-32 overflow-x-hidden">
        <input 
          type="file" 
          ref={tokenizeImageInputRef} 
          className="hidden" 
          accept="image/*" 
          onChange={(e) => handleFileChange(e, 'TOKENIZE')} 
        />
        
        <header className="fixed top-0 left-0 right-0 z-50 bg-slate-950/95 backdrop-blur-md border-b border-slate-900/40 p-5 flex items-center gap-4 max-w-md mx-auto shadow-2xl">
            <button onClick={() => setCurrentView('HOME')} className="h-10 w-10 bg-slate-900 rounded-full flex items-center justify-center text-white border border-slate-800 transition-all active:scale-75 shadow-lg"><i className="fa-solid fa-arrow-left"></i></button>
            <h2 className="text-lg font-black text-white uppercase tracking-tighter leading-none">Solicitar Tokenização</h2>
        </header>

        <div className="pt-24 p-6 space-y-10 max-w-md mx-auto">
          <div className="text-center space-y-2">
             <h3 className="text-amber-500 font-black text-[10px] uppercase tracking-[0.4em]">Converta sua Arte</h3>
             <p className="text-slate-400 text-xs font-medium leading-relaxed px-4">Submeta seu ativo físico para avaliação. Se aprovado, ele será custodiado, segurado e fragmentado em frações digitais líquidas.</p>
          </div>

          <form onSubmit={handleTokenizeSubmit} className="bg-[#111827]/80 border border-slate-800 p-8 rounded-[3rem] space-y-8 shadow-2xl backdrop-blur-md">
             <div 
                onClick={() => tokenizeImageInputRef.current?.click()} 
                className="relative aspect-video bg-[#030712] border-2 border-dashed border-slate-800 rounded-[2rem] overflow-hidden group cursor-pointer hover:border-amber-500/50 transition-all shadow-inner"
             >
                {tokenizeData.imageUrl ? (
                  <img src={tokenizeData.imageUrl} className="w-full h-full object-cover opacity-80" alt="Preview" />
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-slate-600 gap-3">
                     <i className="fa-solid fa-camera text-4xl"></i>
                     <span className="text-[9px] font-black uppercase tracking-[0.3em]">FOTO DA OBRA</span>
                  </div>
                )}
                {isUploading && (
                  <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                     <i className="fa-solid fa-circle-notch fa-spin text-amber-500 text-2xl"></i>
                  </div>
                )}
             </div>

             <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-[9px] text-slate-500 font-black uppercase tracking-[0.3em] ml-1">Título da Obra *</label>
                  <input 
                    className="w-full bg-[#030712] border border-slate-800 rounded-2xl py-4 px-5 text-white text-sm font-bold focus:border-amber-500/50 outline-none transition-all" 
                    value={tokenizeData.title} 
                    onChange={e => setTokenizeData({...tokenizeData, title: e.target.value.toUpperCase()})}
                    placeholder="EX: COMPOSIÇÃO AZUL"
                  />
                </div>
                
                <div className="space-y-2">
                  <label className="text-[9px] text-slate-500 font-black uppercase tracking-[0.3em] ml-1">Artista *</label>
                  <input 
                    className="w-full bg-[#030712] border border-slate-800 rounded-2xl py-4 px-5 text-white text-sm font-bold focus:border-amber-500/50 outline-none transition-all" 
                    value={tokenizeData.artist} 
                    onChange={e => setTokenizeData({...tokenizeData, artist: e.target.value.toUpperCase()})}
                    placeholder="EX: IVAN SERPA"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[9px] text-slate-500 font-black uppercase tracking-[0.3em] ml-1">Ano</label>
                    <input 
                      className="w-full bg-[#030712] border border-slate-800 rounded-2xl py-4 px-5 text-white text-sm font-bold focus:border-amber-500/50 outline-none transition-all" 
                      value={tokenizeData.year} 
                      onChange={e => setTokenizeData({...tokenizeData, year: e.target.value})}
                      placeholder="1970"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[9px] text-slate-500 font-black uppercase tracking-[0.3em] ml-1">Valor Est. (R$)</label>
                    <input 
                      className="w-full bg-[#030712] border border-slate-800 rounded-2xl py-4 px-5 text-white text-sm font-bold focus:border-amber-500/50 outline-none transition-all" 
                      value={tokenizeData.estimatedValue} 
                      onChange={e => setTokenizeData({...tokenizeData, estimatedValue: e.target.value})}
                      placeholder="50.000"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[9px] text-slate-500 font-black uppercase tracking-[0.3em] ml-1">Breve Histórico</label>
                  <textarea 
                    rows={3}
                    className="w-full bg-[#030712] border border-slate-800 rounded-2xl py-4 px-5 text-white text-sm font-medium focus:border-amber-500/50 outline-none transition-all resize-none" 
                    value={tokenizeData.description} 
                    onChange={e => setTokenizeData({...tokenizeData, description: e.target.value})}
                    placeholder="Proveniência, exposições, etc..."
                  />
                </div>
             </div>

             <button 
                type="submit"
                disabled={isLoading || isUploading}
                className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-black py-5 rounded-2xl text-[11px] uppercase tracking-[0.3em] shadow-lg active:scale-95 transition-all flex items-center justify-center gap-3 disabled:opacity-50"
             >
                {isLoading ? <i className="fa-solid fa-circle-notch fa-spin"></i> : <i className="fa-solid fa-paper-plane"></i>}
                {isLoading ? 'ENVIANDO...' : 'ENVIAR PARA CURADORIA'}
             </button>
          </form>
        </div>
      </div>
    );
  };

  const renderProfile = () => (
    <div className="animate-in slide-in-from-bottom duration-500 bg-[#070b14] min-h-screen pb-32">
      <input 
        type="file" 
        ref={avatarInputRef} 
        className="hidden" 
        accept="image/*" 
        onChange={handleAvatarFileChange} 
      />
      <header className="pt-12 pb-8 flex flex-col items-center gap-4">
         <div className="relative">
            <div 
              onClick={() => avatarInputRef.current?.click()} 
              className={`h-32 w-32 bg-[#1a2333] rounded-full border flex items-center justify-center overflow-hidden cursor-pointer active:scale-95 transition-transform ${!userProfile.avatarUrl ? 'border-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.5)] animate-pulse' : 'border-slate-800'}`}
            >
               {userProfile.avatarUrl ? (
                 <img 
                   src={userProfile.avatarUrl} 
                   className="w-full h-full object-cover origin-center" 
                   style={{ 
                     transform: `scale(${userProfile.avatarScale})`,
                     objectPosition: `center ${userProfile.avatarOffset}%`
                   }}
                   alt="Profile" 
                 />
               ) : (
                 <i className="fa-solid fa-camera text-4xl text-slate-500"></i>
               )}
            </div>
            <div className="absolute bottom-1 right-1 h-8 w-8 bg-[#f59e0b] rounded-full flex items-center justify-center border-2 border-[#070b14] shadow-lg pointer-events-none">
               <i className="fa-solid fa-plus text-slate-900 text-xs"></i>
            </div>
            {/* Delete Photo Button */}
            {userProfile.avatarUrl && (
              <button 
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setUserProfile(prev => ({ ...prev, avatarUrl: '' }));
                  showNotification("Foto removida");
                }}
                className="absolute -top-1 -right-1 h-8 w-8 bg-red-500 rounded-full flex items-center justify-center border-2 border-[#070b14] shadow-lg active:scale-90 transition-all z-20"
              >
                <i className="fa-solid fa-trash-can text-white text-[10px]"></i>
              </button>
            )}
         </div>
         
         {userProfile.avatarUrl && (
           <div className="w-full max-w-[280px] space-y-4 px-4 py-2 bg-slate-900/40 rounded-2xl border border-slate-800/50">
             <div className="space-y-1">
               <div className="flex justify-between items-center px-1">
                 <span className="text-[9px] text-slate-500 font-black uppercase tracking-widest">Ajustar Zoom</span>
                 <span className="text-[9px] text-amber-500 font-black">{(userProfile.avatarScale).toFixed(1)}x</span>
               </div>
               <input 
                 type="range" 
                 min="0.5" 
                 max="3" 
                 step="0.1" 
                 value={userProfile.avatarScale}
                 onChange={(e) => setUserProfile({...userProfile, avatarScale: parseFloat(e.target.value)})}
                 className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
               />
             </div>
           </div>
         )}

         <div className="text-center px-4">
            <h2 className="text-xl font-black text-white uppercase tracking-tight mb-0.5">{userProfile.name}</h2>
            <p className="text-amber-500 text-[10px] font-black uppercase tracking-widest">{userProfile.email}</p>
            {!userProfile.avatarUrl && <p className="text-amber-500 text-[8px] font-black uppercase tracking-widest mt-2">Toque no círculo para carregar foto obrigatória</p>}
         </div>
         <div className="flex gap-2 mt-2">
            <button onClick={handleLogout} className="bg-slate-900 border border-slate-800 text-red-500 text-[9px] font-black uppercase tracking-widest px-4 py-2 rounded-full">Encerrar Sessão</button>
            <button onClick={() => handleAdminEdit()} className="bg-amber-500/10 border border-amber-500/30 text-amber-500 text-[9px] font-black uppercase tracking-widest px-4 py-2 rounded-full"><i className="fa-solid fa-lock mr-1"></i> Painel Admin</button>
         </div>
      </header>

      <div className="px-6">
        <form onSubmit={handleProfileSave} className="bg-[#111827]/80 border border-slate-800/60 p-7 rounded-[2.5rem] shadow-2xl shadow-black/40 space-y-6">
           <div className="space-y-2">
              <label className="text-slate-500 text-[10px] font-black uppercase tracking-widest ml-1 opacity-70">Nome Completo</label>
              <input 
                type="text" 
                required 
                value={userProfile.name} 
                onFocus={(e) => { if (userProfile.name === 'INVESTIDOR OASIS') setUserProfile({...userProfile, name: ''}) }}
                onChange={(e) => setUserProfile({...userProfile, name: e.target.value.toUpperCase()})} 
                className="w-full bg-[#030712] border border-slate-800 rounded-2xl py-4 px-5 text-white text-sm font-bold focus:border-amber-500/50 outline-none transition-all shadow-inner" 
              />
           </div>
           <div className="space-y-2">
              <label className="text-slate-500 text-[10px] font-black uppercase tracking-widest ml-1 opacity-70">Email Corporativo</label>
              <div className="flex items-center w-full bg-[#030712] border border-slate-800 rounded-2xl px-5 focus-within:border-amber-500/50 transition-all shadow-inner overflow-hidden">
                <input 
                  type="text" 
                  required 
                  value={userProfile.email.split('@')[0] || ''} 
                  onFocus={(e) => { 
                    if (userProfile.email === 'investidor@oasisrj.com.br') {
                      setUserProfile({...userProfile, email: '@oasisrj.com.br'});
                    }
                  }}
                  onChange={(e) => {
                    const prefix = e.target.value.split('@')[0].toLowerCase().replace(/\s/g, '');
                    setUserProfile({...userProfile, email: `${prefix}@oasisrj.com.br`});
                  }} 
                  className="flex-1 bg-transparent py-4 text-white text-sm font-bold outline-none"
                  placeholder="nome.sobrenome"
                />
                <span className="text-slate-500 text-sm font-bold select-none pointer-events-none">@oasisrj.com.br</span>
              </div>
           </div>
           <div className="space-y-2">
              <label className="text-slate-500 text-[10px] font-black uppercase tracking-widest ml-1 opacity-70">Bio</label>
              <textarea 
                rows={3} 
                value={userProfile.bio} 
                onChange={(e) => setUserProfile({...userProfile, bio: e.target.value})} 
                className="w-full bg-[#030712] border border-slate-800 rounded-2xl py-4 px-5 text-white text-sm font-bold focus:border-amber-500/50 outline-none transition-all resize-none shadow-inner" 
              />
           </div>
           <div className="space-y-2 pt-2 border-t border-slate-800/40">
              <label className="text-amber-500 text-[10px] font-black uppercase tracking-widest ml-1">Senha de acesso (4 números)</label>
              <input 
                type="tel" 
                maxLength={4} 
                id="pin-field" 
                required 
                value={userProfile.pin} 
                onFocus={() => setUserProfile(prev => ({ ...prev, pin: '' }))}
                onChange={(e) => setUserProfile({...userProfile, pin: e.target.value.replace(/\D/g, '').slice(0, 4)})} 
                className="w-full bg-[#030712] border-2 border-amber-500/10 rounded-2xl py-5 px-5 text-amber-500 text-3xl font-black tracking-[1.2em] focus:border-amber-500 outline-none transition-all text-center shadow-inner" 
                placeholder="0000" 
              />
           </div>
           <button type="submit" className="w-full bg-[#10b981] hover:bg-[#059669] text-white font-black py-5 rounded-[1.5rem] text-xs uppercase tracking-[0.25em] shadow-xl shadow-emerald-500/10 active:scale-98 transition-all mt-4">SALVAR ALTERAÇÕES</button>
        </form>
      </div>
      <div className="mt-10 flex justify-center">
         <button onClick={() => setCurrentView('HOME')} className="text-slate-600 hover:text-slate-400 text-[10px] font-black uppercase tracking-[0.3em] transition-colors"><i className="fa-solid fa-arrow-left mr-2"></i> Voltar para Início</button>
      </div>
    </div>
  );

  const renderMarketplace = () => (
      <div className="p-5 pb-32 animate-in fade-in duration-500">
        <header className="mb-8">
          <h2 className="text-4xl font-black text-white uppercase tracking-tighter mb-1">Mercado</h2>
          <p className="text-amber-500 text-[10px] font-black uppercase tracking-[0.3em]">Oportunidades Ativas</p>
        </header>
        <div className="grid grid-cols-1 gap-8">{assets.filter(a => !a.isCatalogOnly).map(asset => <AssetCard key={asset.id} asset={asset} onClick={() => navigateToAsset(asset)} />)}</div>
      </div>
  );

  const renderAssetDetail = () => {
    if (!selectedAsset) return null;
    return (
      <div className="p-0 pb-32 animate-in slide-in-from-right duration-500 bg-slate-950 min-h-screen">
        <header className="fixed top-0 left-0 right-0 z-50 bg-slate-950/95 backdrop-blur-md border-b border-slate-900/40 p-5 flex items-center gap-4 max-w-md mx-auto shadow-2xl">
            <button onClick={() => setCurrentView('HOME')} className="h-10 w-10 bg-slate-900 rounded-full flex items-center justify-center text-white border border-slate-800 transition-all active:scale-75 shadow-lg"><i className="fa-solid fa-arrow-left"></i></button>
            <div className="min-w-0"><h2 className="text-lg font-black text-white uppercase tracking-tighter leading-none truncate">{selectedAsset.artist}</h2></div>
        </header>
        <div className="pt-20">
          <img src={selectedAsset.imageUrl} className="w-full aspect-[4/5] object-cover border-b border-slate-800" alt="" />
          <div className="p-6 space-y-6">
            <h1 className="text-white font-black text-3xl tracking-tighter uppercase">{selectedAsset.artist}</h1>
            <div className="bg-slate-900 border border-slate-800 p-5 rounded-[2rem] space-y-4">
                <h3 className="text-slate-400 text-[9px] font-black uppercase tracking-[0.3em] flex items-center gap-2"><i className="fa-solid fa-file-contract text-amber-500"></i> Ficha Técnica</h3>
                <div className="grid grid-cols-2 gap-y-4 gap-x-2">
                   <div><p className="text-slate-500 text-[8px] uppercase font-bold tracking-widest mb-0.5">Artista</p><p className="text-white font-bold text-sm">{selectedAsset.artist}</p></div>
                   <div><p className="text-slate-500 text-[8px] uppercase font-bold tracking-widest mb-0.5">Ano</p><p className="text-white font-bold text-sm">{selectedAsset.year}</p></div>
                   <div className="col-span-2"><p className="text-slate-500 text-[8px] uppercase font-bold tracking-widest mb-0.5">Descrição</p><p className="text-slate-300 text-xs leading-relaxed">{selectedAsset.description}</p></div>
                </div>
            </div>
            <div className="bg-slate-900/40 border border-slate-800/60 p-5 rounded-[2rem] space-y-5 shadow-xl">
               <h3 className="text-slate-400 text-[9px] font-black uppercase tracking-[0.3em] flex items-center gap-2"><i className="fa-solid fa-shield-halved text-emerald-500"></i> Garantia & Custódia</h3>
                <div className="grid grid-cols-2 gap-4">
                   <div><p className="text-slate-500 text-[8px] uppercase font-bold tracking-widest mb-0.5">Seguradora</p><p className="text-emerald-400 font-bold text-xs uppercase">{selectedAsset.insuranceCompany}</p></div>
                   <div><p className="text-slate-500 text-[8px] uppercase font-bold tracking-widest mb-0.5">Apólice</p><p className="text-white font-mono text-xs uppercase">{selectedAsset.policyNumber}</p></div>
                </div>
              <GuaranteeBar expiryDate={selectedAsset.insuranceExpiry} />
            </div>
            <button 
              onClick={() => setPurchaseAsset({...selectedAsset, quantity: 1})} 
              className="w-full bg-amber-500 hover:bg-amber-600 text-slate-950 font-black py-5 rounded-[1.5rem] text-[10px] uppercase tracking-[0.4em] shadow-lg active:scale-95 transition-all"
            >
              Confirmar Compra
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderPurchaseModal = () => {
    if (!purchaseAsset) return null;
    const quantity = purchaseAsset.quantity || 1;
    const totalCost = (purchaseAsset.fractionPrice || 0) * quantity;
    
    return (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-6 animate-in fade-in duration-300">
           <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-md" onClick={() => setPurchaseAsset(null)}></div>
           <div className="bg-slate-900 border-t sm:border border-slate-800 p-8 rounded-t-[2.5rem] sm:rounded-[2.5rem] w-full max-md relative z-10 shadow-2xl space-y-6 animate-in slide-in-from-bottom duration-300">
                <header className="text-center space-y-2">
                    <div className="h-14 w-14 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto text-emerald-500 mb-2 border border-emerald-500/20"><i className="fa-solid fa-cart-shopping text-xl"></i></div>
                    <h3 className="text-white font-black text-xl uppercase tracking-tight">Confirmar Investimento</h3>
                </header>
                <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 flex gap-4 items-center">
                    <img src={purchaseAsset.imageUrl} className="h-16 w-16 rounded-lg object-cover" alt="" />
                    <div><h4 className="text-white font-black text-sm uppercase">{purchaseAsset.title}</h4><p className="text-slate-500 text-[9px] uppercase font-bold tracking-wider">{purchaseAsset.artist}</p></div>
                </div>
                <div className="space-y-4">
                    <div className="flex justify-between items-center py-2 border-b border-slate-800/50"><span className="text-slate-400 text-xs font-bold uppercase">Preço / Fração</span><span className="text-white font-black text-lg">R$ {(purchaseAsset.fractionPrice || 0).toLocaleString('pt-BR')}</span></div>
                    <div className="flex justify-between items-center py-2 border-b border-slate-800/50"><span className="text-slate-400 text-xs font-bold uppercase">Quantidade</span><span className="text-white font-black text-lg">{quantity} un.</span></div>
                    <div className="flex justify-between items-center py-2 border-b border-slate-800/50"><span className="text-slate-400 text-xs font-bold uppercase">Total a Pagar</span><span className="text-amber-500 font-black text-xl">R$ {totalCost.toLocaleString('pt-BR')}</span></div>
                    <div className="flex justify-between items-center py-2"><span className="text-slate-400 text-xs font-bold uppercase">Seu Saldo</span><span className={`font-black text-sm ${userBalance >= totalCost ? 'text-emerald-400' : 'text-red-400'}`}>R$ {userBalance.toLocaleString('pt-BR')}</span></div>
                </div>
                <div className="pt-2 gap-3 flex flex-col">
                    <button 
                      onClick={handlePurchase} 
                      disabled={isLoading || userBalance < totalCost} 
                      className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-800 disabled:text-slate-500 text-slate-950 font-black py-4 rounded-xl text-[11px] uppercase tracking-[0.2em] shadow-lg active:scale-98 transition-all flex items-center justify-center gap-2"
                    >
                      {isLoading ? <i className="fa-solid fa-circle-notch fa-spin"></i> : <i className="fa-solid fa-check"></i>}
                      {isLoading ? 'Processando...' : 'Confirmar Compra'}
                    </button>
                    <button onClick={() => setPurchaseAsset(null)} disabled={isLoading} className="w-full bg-transparent text-slate-400 font-bold py-3 text-[10px] uppercase tracking-widest hover:text-white transition-colors">Cancelar</button>
                </div>
           </div>
        </div>
    )
  }

  const renderFinanceModal = (type: 'DEPOSIT' | 'WITHDRAW') => {
    const isDeposit = type === 'DEPOSIT';
    return (
      <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-6 animate-in fade-in duration-300">
        <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-md" onClick={() => isDeposit ? setIsDepositModalOpen(false) : setIsWithdrawModalOpen(false)}></div>
        <div className="bg-slate-900 border-t sm:border border-slate-800 p-8 rounded-t-[2.5rem] sm:rounded-[2.5rem] w-full max-sm relative z-10 shadow-2xl space-y-6 animate-in slide-in-from-bottom duration-300">
          <header className="text-center space-y-2">
            <div className={`h-14 w-14 ${isDeposit ? 'bg-emerald-500/10 text-emerald-500' : 'bg-amber-500/10 text-amber-500'} rounded-full flex items-center justify-center mx-auto mb-2 border border-current opacity-60`}>
              <i className={`fa-solid ${isDeposit ? 'fa-arrow-down' : 'fa-arrow-up'} text-xl`}></i>
            </div>
            <h3 className="text-white font-black text-xl uppercase tracking-tight">{isDeposit ? 'Depositar Saldo' : 'Sacar Saldo'}</h3>
            <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest">Disponível: R$ {userBalance.toLocaleString('pt-BR')}</p>
          </header>
          
          <div className="space-y-4">
            <div className="space-y-1">
              <label className="text-slate-500 text-[10px] font-black uppercase tracking-widest ml-1">Valor (R$)</label>
              <input 
                type="number"
                autoFocus
                className="w-full bg-[#030712] border border-slate-800 rounded-2xl py-5 px-6 text-white text-center text-3xl font-bold focus:border-amber-500 outline-none transition-all shadow-inner"
                placeholder="0,00"
                value={transactionAmount}
                onChange={(e) => setTransactionAmount(e.target.value)}
              />
            </div>
          </div>

          <div className="pt-2 gap-3 flex flex-col">
            <button 
              onClick={isDeposit ? handleDeposit : handleWithdraw}
              disabled={isLoading || !transactionAmount}
              className={`w-full ${isDeposit ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-amber-500 hover:bg-amber-600'} disabled:bg-slate-800 disabled:text-slate-500 text-slate-950 font-black py-4 rounded-xl text-[11px] uppercase tracking-[0.2em] shadow-lg active:scale-98 transition-all flex items-center justify-center gap-2`}
            >
              {isLoading ? <i className="fa-solid fa-circle-notch fa-spin"></i> : <i className="fa-solid fa-check"></i>}
              {isLoading ? 'Processando...' : 'Confirmar Transação'}
            </button>
            <button 
              onClick={() => isDeposit ? setIsDepositModalOpen(false) : setIsWithdrawModalOpen(false)}
              className="w-full bg-transparent text-slate-400 font-bold py-3 text-[10px] uppercase tracking-widest hover:text-white transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderInsuranceDocument = () => {
    if (!selectedAsset) return null;
    
    // Formatting date to a readable format similar to "30 DE DEZEMBRO DE 2030"
    const expiryDate = new Date(selectedAsset.insuranceExpiry);
    const months = ["JANEIRO", "FEVEREIRO", "MARÇO", "ABRIL", "MAIO", "JUNHO", "JULHO", "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO"];
    const formattedExpiry = `${expiryDate.getDate()} DE ${months[expiryDate.getMonth()]} DE ${expiryDate.getFullYear()}`;

    return (
      <div className="min-h-screen bg-[#05080f] animate-in fade-in duration-500 flex flex-col overflow-x-hidden">
        <header className="p-6 flex items-center justify-between">
           <div className="flex items-center gap-4">
              <button onClick={() => setCurrentView('CUSTODY_GALLERY')} className="h-10 w-10 bg-slate-900 border border-slate-800 rounded-full flex items-center justify-center text-white active:scale-75 transition-all">
                <i className="fa-solid fa-arrow-left text-sm"></i>
              </button>
              <h1 className="text-white font-black text-sm tracking-widest uppercase">Documento da Seguradora</h1>
           </div>
           <div className="bg-emerald-500/10 border border-emerald-500/30 px-3 py-1.5 rounded-md">
              <span className="text-emerald-500 font-black text-[8px] tracking-[0.2em]">SEGURADO</span>
           </div>
        </header>

        <main className="flex-1 px-4 py-2">
           <div className="bg-[#f8fafc] rounded-lg shadow-2xl overflow-hidden min-h-[600px] flex flex-col">
              {/* Header Certificate */}
              <div className="p-8 border-b border-slate-200 flex justify-between items-start">
                 <div>
                    <h2 className="text-slate-900 font-black text-xl tracking-tight leading-none mb-1">AUREA SAFE GUARD</h2>
                    <p className="text-slate-500 text-[8px] font-black tracking-widest uppercase opacity-70">GLOBAL HERITAGE & ART PROTECTION</p>
                 </div>
                 <div className="h-10 w-10 bg-emerald-500 rounded-full shadow-lg shadow-emerald-500/20"></div>
              </div>

              {/* Main Content */}
              <div className="p-8 flex-1 space-y-12">
                 <div className="space-y-4">
                    <p className="text-slate-400 text-[9px] font-black tracking-widest uppercase">Certificado de Cobertura #{selectedAsset.policyNumber}</p>
                    <div className="space-y-1">
                       <h3 className="text-slate-900 font-black text-3xl tracking-tighter uppercase leading-none">{selectedAsset.artist}</h3>
                       <p className="text-slate-600 font-bold text-lg tracking-tight uppercase">{selectedAsset.title} , ({selectedAsset.year})</p>
                    </div>
                 </div>

                 <div className="grid grid-cols-2 gap-8">
                    <div className="space-y-2">
                       <p className="text-slate-400 text-[8px] font-black tracking-widest uppercase">Nº DA APÓLICE PRINCIPAL</p>
                       <div className="bg-slate-100 px-4 py-2 rounded-md inline-block">
                          <span className="text-slate-900 font-mono font-black text-sm tracking-widest uppercase">{selectedAsset.policyNumber}</span>
                       </div>
                    </div>
                    <div className="space-y-2">
                       <p className="text-slate-400 text-[8px] font-black tracking-widest uppercase">DATA DE VENCIMENTO</p>
                       <p className="text-slate-900 font-black text-sm uppercase">{formattedExpiry}</p>
                    </div>
                 </div>

                 <div className="space-y-3 pt-6">
                    <p className="text-slate-400 text-[8px] font-black tracking-widest uppercase">TERMOS DE GARANTIA</p>
                    <p className="text-slate-600 text-[10px] leading-relaxed font-medium">
                       Este ativo está coberto contra danos físicos totais ou parciais, roubo qualificado, incêndio e intempéries climáticas. A cobertura estende-se ao armazenamento em cofres de alta segurança e transporte monitorado por escolta especializada.
                    </p>
                 </div>
              </div>

              {/* Footer Stamp Section */}
              <div className="p-8 space-y-6 flex flex-col items-center border-t border-slate-100">
                 <div className="w-full flex items-center gap-4">
                    <div className="h-[1px] flex-1 bg-slate-200"></div>
                    <i className="fa-solid fa-landmark text-slate-300"></i>
                    <div className="h-[1px] flex-1 bg-slate-200"></div>
                 </div>
                 
                 <div className="text-center space-y-4">
                    <p className="text-slate-400 text-[8px] font-black tracking-widest uppercase">Autenticação Digital Oasis RJ</p>
                    <div className="h-16 w-16 bg-white border border-slate-200 rounded-lg flex items-center justify-center p-1.5 mx-auto shadow-sm">
                       <img 
                          src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=OASIS_CERTIFICATE_${selectedAsset.policyNumber}`} 
                          alt="CÓDIGO DIGITAL QR"
                          className="w-full h-full object-contain"
                       />
                    </div>
                 </div>
              </div>
           </div>
        </main>

        <footer className="p-6 pt-2">
           <button 
              onClick={() => setCurrentView('CUSTODY_GALLERY')}
              className="w-full bg-slate-900 border border-slate-800 text-white font-black py-5 rounded-lg text-[10px] uppercase tracking-[0.2em] active:scale-95 transition-all shadow-xl"
           >
              Fechar Documento
           </button>
        </footer>
      </div>
    );
  };

  const renderCustodyGallery = () => {
    if (!selectedAsset) return null;
    const allGalleryItems = [{ ...selectedAsset, type: 'MAIN' }, ...(selectedAsset.gallery || [])];

    return (
      <div className="p-0 pb-32 animate-in slide-in-from-right duration-500 bg-slate-950 min-h-screen">
        <header className="fixed top-0 left-0 right-0 z-50 bg-slate-950/95 backdrop-blur-md border-b border-slate-900/40 p-5 flex items-center gap-4 max-w-md mx-auto shadow-2xl">
            <button onClick={() => setCurrentView('HOME')} className="h-10 w-10 bg-slate-900 rounded-full flex items-center justify-center text-white border border-slate-800 transition-all active:scale-75 shadow-lg"><i className="fa-solid fa-arrow-left"></i></button>
            <h2 className="text-lg font-black text-white uppercase tracking-tighter leading-none">{selectedAsset.artist}</h2>
        </header>
        <div className="pt-20 flex flex-col">
            {allGalleryItems.map((item, index) => {
                const itemTotalValue = (item as GalleryItem).totalValue !== undefined ? (item as GalleryItem).totalValue : selectedAsset.totalValue;
                const itemPrice = (itemTotalValue || 0) * 0.1;
                const quantity = gallerySimulations[item.id] || 1;
                const investmentSubtotal = (itemPrice || 0) * quantity;
                
                return (
                <div key={item.id} className="mb-24 last:mb-0 animate-in fade-in duration-700">
                   <div className="relative w-full">
                      <img src={item.imageUrl} className="w-full h-auto object-cover rounded-none shadow-2xl" alt={item.title} />
                      <div className="absolute top-4 right-4 bg-slate-950/20 backdrop-blur-sm px-5 py-2 rounded-full border border-teal-500/20 shadow-2xl opacity-70">
                        <span className="text-teal-400 font-black text-[10px] uppercase tracking-[0.2em]">SEGURADO</span>
                      </div>
                   </div>

                   <div className="px-3 mt-1 space-y-0">
                      {/* Título da Obra - Espaçamento ajustado para aproximar o card abaixo */}
                      <div className="mb-2 px-1">
                        <p className="text-amber-500 font-black text-[9px] uppercase tracking-[0.4em] leading-none mb-0.5">TÍTULO DA OBRA</p>
                        <h3 className="text-white text-3xl font-black uppercase tracking-tight leading-[0.8]">{item.title}</h3>
                      </div>

                      {/* Card Separado: Garantia & Custódia */}
                      <div className="bg-[#0c121e]/90 border border-slate-800/60 p-4 rounded-xl shadow-xl relative overflow-hidden backdrop-blur-md mb-8 h-[150px] flex flex-col justify-between">
                          <div className="absolute top-0 right-0 p-3 opacity-10">
                             <i className="fa-solid fa-shield-halved text-4xl text-emerald-500"></i>
                          </div>
                          
                          <h4 className="text-emerald-400 text-[9px] font-black uppercase tracking-[0.4em] flex items-center gap-2 mb-2">
                             <i className="fa-solid fa-shield-halved"></i> Garantia & Custódia
                          </h4>

                          <div className="space-y-4 flex-1 flex flex-col justify-center">
                            <div className="flex items-center justify-between gap-3 bg-slate-950/40 p-1.5 rounded-xl border border-slate-800/30">
                               <div className="pl-3 py-1 flex-1 min-w-0">
                                  <p className="text-slate-500 text-[8px] uppercase font-black tracking-widest opacity-70 mb-0.5">Seguradora</p>
                                  <p className="text-emerald-400 font-black text-xs uppercase tracking-tight leading-tight truncate">{selectedAsset.insuranceCompany}</p>
                               </div>
                               <button 
                                  onClick={() => setCurrentView('INSURANCE_DOCUMENT')}
                                  className="bg-amber-500 text-slate-950 p-2.5 rounded-lg flex flex-col items-center justify-center transition-all active:scale-95 shadow-lg group/policy-btn min-w-[85px]"
                               >
                                  <span className="text-slate-900/60 text-[7px] uppercase font-black tracking-widest mb-0.5 leading-none text-center">APÓLICE</span>
                                  <span className="font-mono text-11px font-black flex items-center gap-1 leading-none uppercase">
                                     {selectedAsset.policyNumber}
                                     <i className="fa-solid fa-arrow-up-right-from-square text-[8px] group-hover/policy-btn:scale-110 transition-transform"></i>
                                  </span>
                               </button>
                            </div>
                            
                            <div className="pt-1">
                               <GuaranteeBar expiryDate={selectedAsset.insuranceExpiry} />
                            </div>
                          </div>
                      </div>

                      {/* Asterisco Amarelo entre os Cards */}
                      <div className="flex justify-center text-amber-500 text-2xl font-black mb-4">*</div>

                      {/* Card "Valor da Obra" - Layout com altura superior reduzida e proporcional */}
                      <div className="bg-[#0b121f] border border-[#1e293b] p-4 pt-3 rounded-xl shadow-2xl mb-12 flex flex-col overflow-hidden">
                         
                         <div className="flex justify-between items-end mb-1 px-1">
                            <p className="text-[#34d399] text-[9px] font-black uppercase tracking-[0.4em] leading-none">VALOR DA OBRA</p>
                            <div className="text-right flex items-end justify-end gap-1 leading-none">
                               <div className="flex items-center gap-[0.2em]">
                                  <span className="text-[#f59e0b] text-[9px] font-black uppercase tracking-[0.4em] -mr-[0.4em]">FRAÇÃO</span>
                                  <span className="text-[11px] font-bold opacity-80 text-[#f59e0b] tracking-normal">(10%)</span>
                               </div>
                               <span className="text-[#f59e0b] text-[9px] font-black uppercase tracking-[0.4em]">/ PREÇO</span>
                            </div>
                         </div>

                         <div className="flex justify-between items-baseline mb-1 px-1">
                            <div className="flex items-baseline text-white tracking-[-0.08em] leading-none">
                               <span className="text-[14px] font-bold mr-3 opacity-80">R$</span>
                               <span className="text-xl font-black">
                                  {(itemTotalValue || 0).toLocaleString('pt-BR')}
                               </span>
                            </div>
                            <div className="flex items-baseline justify-end text-[#f59e0b] tracking-[-0.08em] leading-none">
                               <span className="text-[14px] font-bold mr-3">R$</span>
                               <span className="text-xl font-black">
                                  {(itemPrice || 0).toLocaleString('pt-BR')}
                               </span>
                            </div>
                         </div>

                         <div className="flex justify-between items-center mb-0.5 px-1 pt-1 border-t border-slate-800/20">
                            <p className="text-slate-500 text-[10px] font-black uppercase tracking-[0.15em]">QUANTIDADE DE FRAÇÕES</p>
                            <p className="text-white text-[11px] font-black uppercase tracking-[0.15em]">{quantity} UN.</p>
                         </div>

                         <div className="flex items-center gap-1.5 mb-3">
                            <button 
                               onClick={() => setGallerySimulations(prev => ({ ...prev, [item.id]: Math.max(1, (prev[item.id] || 1) - 1) }))}
                               className="h-8 w-8 bg-slate-950 border border-slate-800 rounded-lg flex items-center justify-center text-white active:scale-90 transition-all text-sm"
                            >
                               <i className="fa-solid fa-minus"></i>
                            </button>
                            
                            <div className="flex-1 h-8 bg-slate-950 border border-slate-800 rounded-lg flex items-center justify-center">
                               <span className="text-[#34d399] text-lg font-black tracking-[-0.08em]">{quantity}</span>
                            </div>

                            <button 
                               onClick={() => setGallerySimulations(prev => ({ ...prev, [item.id]: (prev[item.id] || 1) + 1 }))}
                               className="h-8 w-8 bg-slate-950 border border-slate-800 rounded-lg flex items-center justify-center text-white active:scale-90 transition-all text-sm"
                            >
                               <i className="fa-solid fa-plus"></i>
                            </button>
                         </div>

                         <div className="flex justify-between items-center mb-1 px-1">
                            <p className="text-slate-500 text-[10px] font-black uppercase tracking-[0.2em]">SUBTOTAL</p>
                            <div className="flex items-baseline text-white tracking-[-0.08em] leading-none">
                               <span className="text-[14px] font-bold mr-3 text-[#f59e0b]">R$</span>
                               <span className="text-2xl font-black">
                                  {(investmentSubtotal || 0).toLocaleString('pt-BR')}
                               </span>
                            </div>
                         </div>

                         <div className="flex gap-2">
                            <button 
                              onClick={() => setPurchaseAsset({...selectedAsset, ...item, fractionPrice: itemPrice, quantity: quantity})} 
                              className="flex-1 bg-[#f59e0b] hover:bg-[#d97706] text-slate-950 font-black py-3 rounded-lg text-[11px] uppercase tracking-[-0.05em] shadow-lg active:scale-95 transition-all flex items-center justify-center gap-1.5"
                            >
                               <i className="fa-solid fa-chart-pie text-sm"></i>
                               COMPRA FRAÇÃO
                            </button>
                            <button 
                              onClick={() => setPurchaseAsset({...selectedAsset, ...item, fractionPrice: itemTotalValue, quantity: 1})} 
                              className="flex-1 bg-[#10b981] hover:bg-[#059669] text-slate-950 font-black py-3 rounded-lg text-[11px] uppercase tracking-[-0.05em] shadow-lg active:scale-95 transition-all flex items-center justify-center gap-1.5"
                            >
                               <i className="fa-solid fa-gem text-sm"></i>
                               COMPRA INTEGRAL
                            </button>
                         </div>
                      </div>
                      
                      <div className="pt-8 pb-4">
                        <div className="h-[2px] w-[60%] mx-auto bg-gradient-to-r from-transparent via-slate-800 to-transparent"></div>
                      </div>
                   </div>
                </div>
                );
            })}
            
            <div className="px-6 pt-16 pb-24 text-center">
               <button onClick={() => setCurrentView('HOME')} className="text-slate-600 hover:text-white text-[10px] font-black uppercase tracking widest py-4 px-10 bg-slate-900/50 border border-slate-800 rounded-full transition-all active:scale-95">
                  <i className="fa-solid fa-arrow-left mr-2"></i> Voltar ao Acervo
               </button>
            </div>
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-md mx-auto min-h-screen bg-slate-950 relative shadow-2xl overflow-x-hidden ring-1 ring-slate-800 antialiased selection:bg-amber-500/40">
      <main className="min-h-screen">
        {!isAuthenticated ? (
          <LoginScreen onLogin={handleLogin} />
        ) : (
          <>
            {currentView === 'HOME' && renderHome()}
            {currentView === 'MARKETPLACE' && renderMarketplace()}
            {currentView === 'ASSET_DETAIL' && renderAssetDetail()}
            {currentView === 'CUSTODY_GALLERY' && renderCustodyGallery()}
            {currentView === 'INSURANCE_DOCUMENT' && renderInsuranceDocument()}
            {currentView === 'PROFILE' && renderProfile()}
            {currentView === 'TOKENIZE' && renderTokenize()}
            {currentView === 'ADMIN_LOGIN' && renderAdminLogin()}
            {currentView === 'ADMIN' && renderAdminEditor()}
            {currentView === 'TRADING' && <div className="p-10 text-center uppercase font-black text-slate-600">Em Breve</div>}
            {currentView === 'WALLET' && renderPortfolio()}
          </>
        )}
      </main>
      {renderPurchaseModal()}
      {isDepositModalOpen && renderFinanceModal('DEPOSIT')}
      {isWithdrawModalOpen && renderFinanceModal('WITHDRAW')}
      {!['ADMIN', 'ADMIN_LOGIN', 'CUSTODY_GALLERY', 'INSURANCE_DOCUMENT', 'TOKENIZE'].includes(currentView) && (
        <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto h-24 bg-slate-950/95 backdrop-blur-3xl border-t border-slate-900/50 flex justify-around items-center px-6 z-50 shadow-[0_-20px_60px_rgba(0,0,0,1)]">
            {[ { icon: 'fa-house', label: 'Home', view: 'HOME' }, { icon: 'fa-compass', label: 'Explorar', view: 'MARKETPLACE' }, { icon: 'fa-shuffle', label: 'Swap', view: 'TRADING' }, { icon: 'fa-wallet', label: 'Portfolio', view: 'WALLET' } ].map((item) => (
            <button key={item.view} onClick={() => { 
                const view = item.view as ViewType;
                if (view === 'WALLET') {
                    requestPIN(() => {
                        setCurrentView(view);
                        setSelectedAsset(null);
                    });
                } else {
                    setCurrentView(view);
                    setSelectedAsset(null);
                }
            }} className={`flex flex-col items-center justify-center gap-2 w-16 transition-all active:scale-75 relative group ${currentView === item.view ? 'text-amber-500' : 'text-slate-600 hover:text-slate-400'}`}>
                <i className={`fa-solid ${item.icon} text-2xl transition-all duration-500 ${currentView === item.view ? 'scale-125 -translate-y-1' : ''}`}></i>
                <span className="text-[8px] font-black uppercase tracking-[0.3em]">{item.label}</span>
            </button>
            ))}
        </nav>
      )}
      {showToast && <div className="fixed bottom-32 left-1/2 -translate-x-1/2 bg-emerald-500 text-white px-10 py-4 rounded-full shadow-2xl flex items-center gap-4 animate-in slide-in-from-bottom-10 fade-in z-[100] border border-emerald-400/50"><i className="fa-solid fa-circle-check text-lg"></i><span className="text-[10px] font-black uppercase tracking-[0.3em] whitespace-nowrap leading-none">{toastMessage}</span></div>}
    </div>
  );
};

export default App;