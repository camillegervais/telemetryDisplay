% 1. Récupération des noms des signaux
signalNames = who(out);

% 2. Référence (sLap)
try
    sLap_ts = out.get('sLap');
    sLap = sLap_ts.Data;
catch
    error('Impossible de trouver sLap dans l''objet out.');
end

targetSize = length(sLap);
queryPoints = linspace(0, 1, targetSize);
exportedVars = {};

fprintf('\n--- Début de l''importation et du Resampling ---\n');
fprintf('%-20s | %-12s | %-12s | %-10s | %-10s | %-10s\n', 'Signal', 'Taille Orig.', 'Taille Cible', 'Min', 'Max', 'Status');
fprintf('----------------------------------------------------------------------------------------------------\n');

% 3. Boucle automatique
for i = 1:length(signalNames)
    varName = signalNames{i};
    item = out.get(varName);
    
    % Extraction des données
    data = [];
    if isa(item, 'timeseries')
        data = item.Data;
    elseif isstruct(item) && isfield(item, 'Data')
        data = item.Data;
    elseif isnumeric(item) || islogical(item)
        data = item;
    end
    
    if isempty(data)
        continue;
    end
    
    % Vérification numérique
    if isnumeric(data) || islogical(data)
        data = double(data);
        
        % Nettoyage des dimensions (ex: 1x1xN -> N)
        if ndims(data) > 2
            data = squeeze(data);
        end
        
        origSize = length(data);
        statusStr = 'OK';

        % --- CAS PARTICULIER : Signal scalaire (0 ou constante) ---
        if origSize == 1
            % On crée un vecteur rempli de cette valeur constante
            constantValue = data;
            data = ones(targetSize, 1) * constantValue;
            statusStr = 'Constant';
            
        % --- CAS GÉNÉRAL : Resampling ---
        elseif origSize ~= targetSize
            originalPoints = linspace(0, 1, origSize);
            data = interp1(originalPoints, data, queryPoints, 'linear');
            statusStr = 'Resampled';
        end
        
        % Format colonne
        data = data(:); 
        
        % Affichage des propriétés
        valMin = min(data);
        valMax = max(data);
        fprintf('%-20s | %-12d | %-12d | %-10.2f | %-10.2f | %-10s\n', ...
                varName, origSize, targetSize, valMin, valMax, statusStr);
        
        % Export vers le workspace
        assignin('caller', varName, data);
        exportedVars{end+1} = varName;
    end
end

fprintf('----------------------------------------------------------------------------------------------------\n');

% 4. Sauvegarde
if ~isempty(exportedVars)
    save('./data/results/data_pilote_losail_result.mat', exportedVars{:});
    fprintf('Succès ! %d signaux exportés.\n\n', length(exportedVars));
else
    disp('Aucun signal numérique trouvé.');
end