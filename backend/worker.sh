while true
do
    echo "Start worker"
    npm run cli modules update
    npm i --prefix ../packages
    npm run worker
    
    app_status=$?
    echo "Exit status ${app_status}"
    
    if [ ${app_status} -ne 123 ]; then
        echo "Worker failed"
        exit ${app_status}
    fi

    echo "Reboot worker"

done
