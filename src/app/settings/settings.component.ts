import { Component, OnInit } from '@angular/core';
import { HydrusApiSettingsService } from '../hydrus-api-settings.service';
import { ActivatedRoute } from '@angular/router';

@Component({
  selector: 'app-settings',
  templateUrl: './settings.component.html',
  styleUrls: ['./settings.component.scss']
})
export class SettingsComponent implements OnInit {

  constructor(
    public apiSettings: HydrusApiSettingsService,
    private route: ActivatedRoute
  ) { }


  ngOnInit() {
  }

  initialSelect = this.route.snapshot.data['settingsTab'] ?? (this.apiSettings.apiSet() ? 1 : 0);


}
