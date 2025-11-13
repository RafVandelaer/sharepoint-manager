// History management module
import { api } from './api.js';
import { $ } from './ui.js';

export function setupHistoryHandlers(app) {
    const historyModal = $('historyModal');
    const showHistoryBtn = $('showHistoryBtn');
    const closeHistoryModal = $('closeHistoryModal');
    
    // Verbeterde close handlers
    const closeModal = () => {
        const historyModalContainer = $('historyModalContainer');
        if (historyModalContainer) {
            historyModalContainer.innerHTML = ''; // Verwijder de hele modal
        }
        if (currentHistoryRequest) {
            currentHistoryRequest.abort();
            currentHistoryRequest = null;
        }
    };
    
    showHistoryBtn.addEventListener('click', async () => {
        if (!app.currentSite) {
            console.error('Geen site geselecteerd');
            return;
        }
        
        // Check eerst of er geschiedenis is voordat we het venster tonen
        try {
            const history = await api.get(`/sites/${app.currentSite.id}/cleanup-history`);
            if (!history || history.length === 0) {
                return; // Geen geschiedenis, toon niets
            }
            // Alleen als er geschiedenis is, tonen we het venster
            showCleanupHistory(app);
        } catch (error) {
            console.error('Error checking cleanup history:', error);
        }
    });
    
    // Zorg ervoor dat de close knop altijd werkt
    if (closeHistoryModal) {
        closeHistoryModal.addEventListener('click', closeModal);
    } else {
        console.error('Close history modal button niet gevonden');
    }
    
    // Sluit modal als er buiten wordt geklikt
    window.addEventListener('click', (e) => {
        const historyModal = $('historyModal');
        if (historyModal && e.target === historyModal) {
            closeModal();
        }
    });
}

let currentHistoryRequest = null;

export async function showCleanupHistory(app) {
    const historyModalContainer = $('historyModalContainer');
    
    if (!historyModalContainer || !app?.currentSite) {
        console.error('Vereiste elementen niet gevonden');
        return;
    }
    
    try {
        // We weten al dat er geschiedenis is, deze is al gecontroleerd in de click handler
        const history = await api.get(`/sites/${app.currentSite.id}/cleanup-history`);
        
        // Maak de modal HTML
        historyModalContainer.innerHTML = `
            <div id="historyModal" class="modal">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3><i class="fas fa-history"></i> Opschoning Geschiedenis</h3>
                        <button class="close-btn" id="closeHistoryModal">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div id="cleanupHistory" class="history-list"></div>
                    </div>
                </div>
            </div>
        `;
        
        // Nu we de modal hebben gemaakt, kunnen we de elementen ophalen
        const historyModal = $('historyModal');
        const historyList = $('cleanupHistory');
        
        // Voeg de close handler opnieuw toe
        const closeHistoryModal = $('closeHistoryModal');
        if (closeHistoryModal) {
            closeHistoryModal.addEventListener('click', () => {
                historyModalContainer.innerHTML = ''; // Verwijder de hele modal
            });
        }
        
        if (!history || history.length === 0) {
            // Geen geschiedenis beschikbaar, doe niets
            return;
        }
        
        // Toon geschiedenis alleen als er items zijn
        const historyHtml = history.map(entry => {
            const date = new Date(entry.timestamp);
            const formattedDate = date.toLocaleString('nl-NL', { 
                dateStyle: 'full', 
                timeStyle: 'medium' 
            });
            
            return `
                <div class="history-item">
                    <div class="history-timestamp">
                        <i class="fas fa-calendar"></i>
                        ${formattedDate}
                    </div>
                    <div class="history-details">
                        <div class="history-stat">
                            <i class="fas fa-file"></i>
                            ${entry.totalFiles} bestanden gescand
                        </div>
                        <div class="history-stat">
                            <i class="fas fa-code-branch"></i>
                            ${entry.totalVersions} versies gevonden
                        </div>
                        <div class="history-stat">
                            <i class="fas fa-trash"></i>
                            ${entry.versionsRemoved} versies verwijderd
                        </div>
                        <div class="history-stat">
                            <i class="fas fa-save"></i>
                            ${entry.storageSaved} bespaard
                        </div>
                        <div class="history-stat">
                            <i class="fas fa-archive"></i>
                            ${entry.versionsToKeep} versies behouden per bestand
                        </div>
                    </div>
                </div>
            `;
        }).join('');
        
        // Alleen als we hier komen (er is geschiedenis) tonen we het venster
        historyList.innerHTML = historyHtml;
        historyModal.style.display = 'flex';
        
    } catch (error) {
        console.error('Error fetching cleanup history:', error);
        // Toon geen error message in het venster, log alleen de fout
        return;
    }
}