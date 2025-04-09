#!/bin/bash

install_packages=false

# Parse -i flag
while getopts "i" opt; do
  case $opt in
    i)
      install_packages=true
      ;;
  esac
done

while true
do
    echo "Start worker"

    if $install_packages; then
      if [ ! -d "../packages" ]; then
        echo "Creating packages directory"
        mkdir -p ../packages
      else
        echo "Packages directory already exists"
      fi

      echo "Updating modules and install packages"
      npm run cli modules update
      app_status=$?
      if [ $app_status -ne 0 ]; then
        echo "Can't update modules"
        exit $app_status
      fi
      npm i --prefix ../packages
      if [ $app_status -ne 0 ]; then
        echo "Can't install modules"
        exit $app_status
      fi
    else
      echo "Skipping update packages"
    fi

    npm run worker -- "$@"
    
    app_status=$?
    echo "Exit status ${app_status}"
    
    if [ ${app_status} -ne 123 ]; then
        echo "Worker stopped"
        exit ${app_status}
    fi
    
    echo "Rebooting worker"
    
done
