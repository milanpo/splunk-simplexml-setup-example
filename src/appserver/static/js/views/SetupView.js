/*
 * This view is intended to be used as a base class for simpleXML setup views. This class is
 * intended to make creation of a setup view easier by:
 * 
 *   1) Providing a mechanism for setting the app as configured so that users aren't redirected through setup again.
 *   2) Providing a means for permission checking so that you can ensure that the user has admin_all_objects
 * 
 * To use this class, you will need to do the following:
 * 
 *   1) Make your view class sub-class "SetupView" (the class providing in this file)
 *   2) Call this classes initialize() function in your classes initialize() function.
 *   3) Call setConfigured() when your class completes setup. This will mark the app as configured.
 * 
 * Below is a short example of of the use of this class:
 
require.config({
    paths: {
        setup_view: '../app/my_custom_app/js/views/SetupView'
    }
});

define([
    "underscore",
    "backbone",
    "jquery",
    "setup_view",
], function(
    _,
    Backbone,
    $,
    SetupView
){

    return SetupView.extend({
        className: "MyCustomAppSetupView",

        events: {
            "click #save-config" : "saveConfig"
        },
        
        defaults: {
        	app_name: "my_custom_app"
        },

        initialize: function() {
        	this.options = _.extend({}, this.defaults, this.options);
            SetupView.prototype.initialize.apply(this, [this.options]);
        },

        saveConfig: function(){
            if(this.userHasAdminAllObjects()){
                this.setConfigured();
            }
            else{
                alert("You don't have permission to edit this app");
            }
        },
        
        render: function () {
            this.$el.html('<a href="#" class="btn btn-primary" id="save-config">Save Configuration</a>');
        }
    });
});
 */

define([
    "underscore",
    "backbone",
    "splunkjs/mvc",
    "jquery",
    "models/SplunkDBase",
    "splunkjs/mvc/simplesplunkview",
    "util/splunkd_utils",
    "splunkjs/mvc/utils"
], function(
    _,
    Backbone,
    mvc,
    $,
    SplunkDBaseModel,
    SimpleSplunkView,
    splunkd_utils,
    mvc_utils
){

	var AppConfig = SplunkDBaseModel.extend({
	    initialize: function() {
	    	SplunkDBaseModel.prototype.initialize.apply(this, arguments);
	    }
	});

    var EncryptedCredential = SplunkDBaseModel.extend({
        url: "storage/passwords",
	    initialize: function() {
	    	SplunkDBaseModel.prototype.initialize.apply(this, arguments);
	    }
	});

    return SimpleSplunkView.extend({
        className: "SetupView",
        
        defaults: {
        	app_name: null
        },

        initialize: function() {

            // Merge the provided options and the defaults
        	this.options = _.extend({}, this.defaults, this.options);
        	
        	// Get the app name
        	this.app_name = this.options.app_name;

            // This indicates if the app was configured
            this.is_app_configured = null;

            this.app_config = null;
            this.encrypted_credential = null;

            this.capabilities = null;
            this.is_using_free_license = null;

            // Start the process of the getting the app.conf settings
            this.getAppConfig();
        },

        /**
         * Get the app configuration.
         */
        getAppConfig: function(){

            // Use the current app if the app name is not defined
            if(this.app_name === null || this.app_name === undefined){
                this.app_name = mvc_utils.getCurrentApp();
            }

	        this.app_config = new AppConfig();
	        	
            this.app_config.fetch({
                url: splunkd_utils.fullpath('/servicesNS/nobody/system/apps/local/' + this.app_name),
                success: function (model, response, options) {
                    console.info("Successfully retrieved the app configuration");
                    this.is_app_configured = model.entry.associated.content.attributes.configured;
                }.bind(this),
                error: function () {
                    console.warn("Unable to retrieve the app configuration");
                }.bind(this)
            });
        },

        /**
         * Make the stanza name for a entry in the storage/passwords endpoint from the username and realm.
         */
        makeStorageEndpointStanza: function(username, realm){

            if(this.isEmpty(realm)){
                realm = "";
            }

            return realm + ":" + username + ":";
        },

        /**
         * Get the encrypted credential.
         */
        getEncryptedCredential: function(stanza){

            // Get a promise ready
        	var promise = jQuery.Deferred();

            // Make an instance to fetch into
	        this.encrypted_credential = new EncryptedCredential();

            // Fetch it
            this.encrypted_credential.fetch({
                url: splunkd_utils.fullpath('/services/storage/passwords/' + stanza),
                success: function (model, response, options) {
                    console.info("Successfully retrieved the encrypted credential");
                    promise.resolve(model);
                }.bind(this),
                error: function () {
                    console.warn("Unable to retrieve the encrypted credential");
                    promise.reject();
                }.bind(this)
            });

            // Return the promise so that the caller can respond
            return promise;
        },

        /**
         * This is called when a credential was successfully saved.
         */
        credentialSuccessfullySaved: function(created_new){
            
        },

        /**
         * Get the name of the app to use for saving entries to.
         */
        getAppName: function(){
            if(this.app_name === null){
                return mvc_utils.getCurrentApp();
            }
            else{
                return this.app_name;
            }
        },

        /**
         * Return true if the input is undefined, null or is blank.
         */
        isEmpty: function(value, allowBlanks){

            // Assign a default for allowBlanks
            if(typeof allowBlanks == "undefined"){
                allowBlanks = false;
            }

            // Test the value
            if(typeof value == "undefined"){
                return true;
            }

            else if(value === null){
                return true;
            }

            else if(value === "" && !allowBlanks){
                return true;
            }

            return false;
        },

        /**
         * Save the encrypted crendential. This will create a new encrypted credential if it doesn't exist.
         * 
         * If it does exist, it will modify the existing credential.
         */
        saveEncryptedCredential: function(username, password, realm){

            // Verify the username
            if(this.isEmpty(username)){
                alert("The username field cannot be empty");
                return;
            }

            // Verify the password
            if(this.isEmpty(password, true)){
                alert("The password field cannot be empty");
                return;
            }

            // Create a reference to the stanza name so that we can find if a credential already exists
            var stanza = this.makeStorageEndpointStanza(username, realm);
    
            // See if the credential already exists and edit it instead.
            $.when(this.getEncryptedCredential(stanza)).done(

                // Save changes to the existing credential
                function(credentialModel){

                    // Save changes to the existing entry
                    this.postEncryptedCredential(credentialModel, username, password, realm);

                    // Run any post success function calls
                    this.credentialSuccessfullySaved(false);
                }.bind(this)
            )
            .fail(
                function(){

                    // Make a new credential instance
                    credentialModel = new EncryptedCredential({
                        user: 'nobody',
                        app: this.getAppName()
                    });

                    // Save it
                    this.postEncryptedCredential(credentialModel, username, password, realm);

                    // Run any post success function calls
                    this.credentialSuccessfullySaved(false);
    
                }.bind(this)
            )

        },

        /**
         * Save the encrypted crendential.
         */
        postEncryptedCredential: function(credentialModel, username, password, realm){

            // Use the current app if the app name is not defined
            if(this.app_name === null){
                this.app_name = mvc_utils.getCurrentApp();
            }

            // Modify the model
            credentialModel.entry.content.set({
                name: username,
                password: password,
                username: username,
                realm: realm
            }, {
                silent: true
            });

            // Kick off the request to edit the entry
            var saveResponse = credentialModel.save();

            // Wire up a response to tell the user if this was a success
            if (saveResponse) {

                // If successful, show a success message
                saveResponse.done(function(model, response, options){
                    console.info("Credential was successfully saved");
                }.bind(this))

                // Otherwise, show a failure message
                .fail(function(response){
                    console.warn("Credential was not successfully updated");
                }.bind(this));
            }
        },

        /**
         * Save the app config to note that it is now configured.
         */
        setConfigured: function(){

            // Not necessary to set the app as configured since it is already configured
            if(this.is_app_configured){
                console.info("App is already set as configured; no need to update it");
                return;
            }

            // Modify the model
            this.app_config.entry.content.set({
                configured: true
            }, {
                silent: true
            });

            // Kick off the request to edit the entry
            var saveResponse = this.app_config.save();

            // Wire up a response to tell the user if this was a success
            if (saveResponse) {

                // If successful, show a success message
                saveResponse.done(function(model, response, options){
                    console.info("App configuration was successfully updated");
                }.bind(this))

                // Otherwise, show a failure message
                .fail(function(response){
                    console.warn("App configuration was not successfully updated");
                }.bind(this));
            }

        },

        /**
         * Determine if the user has the given capability.
         */
        hasCapability: function(capability){

        	var uri = Splunk.util.make_url("/splunkd/__raw/services/authentication/current-context?output_mode=json");

        	if(this.capabilities === null){

	            // Fire off the request
	            jQuery.ajax({
	            	url:     uri,
	                type:    'GET',
	                async:   false,
	                success: function(result) {

	                	if(result !== undefined){
	                		this.capabilities = result.entry[0].content.capabilities;
	                	}

	                }.bind(this)
	            });
        	}

			// See if the user is running the free license
			if(this.capabilities.length === 0 && this.is_using_free_license === null){

				uri = Splunk.util.make_url("/splunkd/__raw/services/licenser/groups/Free?output_mode=json");

				// Do a call to see if the host is running the free license
	            jQuery.ajax({
	            	url:     uri,
	                type:    'GET',
	                async:   false,
	                success: function(result) {

	                	if(result !== undefined){
	                		this.is_using_free_license = result.entry[0].content['is_active'];
	                	}
						else{
							this.is_using_free_license = false;
						}

	                }.bind(this)
	            });
			}

			// Determine if the user should be considered as having access
			if(this.is_using_free_license){
				return true;
			}
			else{
				return $.inArray(capability, this.capabilities) >= 0;
			}

        },

        userHasAdminAllObjects: function(){
            return this.hasCapability('admin_all_objects');
        }
    });
});